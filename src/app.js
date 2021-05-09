// nodejs module
const {app, BrowserWindow, dialog, shell, ipcMain, Notification} = require('electron');
const createDesktopShortcut = require('create-desktop-shortcuts');
const cic = require('check-internet-connected');
const randomInt = require('random-int');
const child = require("child_process");
const find = require('find-process');
const wait = require('waait');
const path = require('path');
const fs = require('fs');

// custom module
const open = require('./lib/open');
const FM = require('./lib/fileManager');
const reg = require('./lib/regManager');
const request = require('./lib/request');

// variables
let serverConfig;

let window_width = 1280;
let window_height = 720;
let window;

let installSuccess = true;

let windowOption = {
    width: window_width,
    height: window_height,
    resizable: false,
    movable: false,
    maximizable: false,
    closable: false,
    fullscreenable: false,
    transparent: true,
    //frame: false, // TODO 2021-05-09: 얘 주석 풀면 환영 페이지에서 안넘어가는듯,,,?
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#c5cae9',
    webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
    },
    icon: path.join(__dirname, 'images', 'icon.png')
};

let config = {
    language: 'ko',
    licenseAgree: false,
    privacyAgree: false,
    startWithWindows: true,
    desktopShortcut: true,
    startMenuFolder: 'Adobe Discord RPC',
    startMenuFolderUse: true,
    installPath: 'C:\\Program Files\\Adobe Discord RPC'
};

// windows
const checkLanguage = async () => {
    ipcMain.once('setLanguage', (event, res) => {
        config.language = res;
        checkOption();
    });

    await window.loadFile(path.join(__dirname, 'views', 'check_lang.html'));

    window.once('ready-to-show', async () => {return window.show();});
};

const checkOption = async () => {
    await window.loadFile(path.join(__dirname, 'views', 'option_1_welcome.html'));
};

const installingFinish = async (contents, notify, lang) => {
    if (installSuccess) contents.send('installMessage', {
        percentage: 100,
        message: '프로그램 설치가 완료되었습니다.\n\'다음\' 버튼을 눌러 설치 과정을 마무리하세요.'
    });
    else contents.send('installMessage', {
        percentage: 100,
        message: '프로그램 설치에 실패했습니다.\n\'다음\' 버튼을 눌러 설치 과정을 마무리하세요.'
    });
    contents.send('installFinish', 0);
    window.removeAllListeners('minimize');
    window.removeAllListeners('blur');
    if (notify) new Notification({
        title: lang['installNotify']['title'],
        body: `${lang['installNotify']['finish']}`,
        icon: path.join(__dirname, 'images', 'icon.png')
    }).show();
};

const installing = async () => {
    let lang;
    let contents = window.webContents;
    let notify = false;
    let filePath = path.join(__dirname, 'lang', `${config.language}.json`);

    try {
        if (fs.statSync(filePath).isFile()) lang = require(filePath);
        else lang = undefined;
    } catch (e) {
        console.log(e);
        lang = undefined;
    }

    if (!config.licenseAgree || !config.privacyAgree) {
        contents.send('installMessage', {
            percentage: 0,
            message: lang.install.infoMsg.wrongAccess
        });
        return await installingFinish(contents, notify, lang);
    }

    const createShortcut = (windows) => {
        return new Promise((resolve, reject) => {
            const shortcutsCreated = createDesktopShortcut({
                customLogger: function (message, error) {
                    console.log(message, error);
                },
                windows
            });
            
            if (shortcutsCreated) resolve();
            else reject();
        });
    }

    contents.send('installMessage', {
        percentage: 0,
        message: lang.install.infoMsg.startInstall
    });

    window.once('minimize', () => {
        if (!notify) {
            notify = true;
            new Notification({
                title: lang['installNotify']['title'],
                body: `${lang['installNotify']['body1']}\n${lang['installNotify']['body2']}`,
                icon: path.join(__dirname, 'images', 'icon.png')
            }).show();
        }
    });

    window.once('blur', () => {
        if (!notify) {
            notify = true;
            new Notification({
                title: lang['installNotify']['title'],
                body: `${lang['installNotify']['body1']}\n${lang['installNotify']['body2']}`,
                icon: path.join(__dirname, 'images', 'icon.png')
            }).show();
        }
    });

    /*
     *  폴더 생성 -> (다운로드 -> 무결성 -> 압축풀기)*반복 -> 파일 이동 -> 스크립트 -> 설정파일(+포트) -> 레지스트리 -> 시작메뉴(option) -> 기타 옵션
     */

    // 경로 정의
    let dl_path = path.join(config.installPath, 'temp_installer', 'dl');
    let upk_path = path.join(config.installPath, 'temp_installer', 'upk');
    let scripts_upk = path.join(serverConfig.files.Scripts.unpack);
    let startMenu_path = path.join('%PROGRAMDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Adobe Discord RPC');
    let startup_path = path.join('%PROGRAMDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup');

    await wait(1000);
    contents.send('installMessage', {
        percentage: 5,
        message: lang.install.infoMsg.folderInit.working
    });
    try {
        if (await fs.existsSync(config.installPath)) {
            let fdList = fs.readdirSync(config.installPath);
            for (let i = 0; i < fdList.length; i++) {
                let filename = path.join(config.installPath, fdList[i]);
                let stat = fs.statSync(filename);

                if(filename === "." || filename === "..") {
                    //
                } else if(stat.isDirectory()) {
                    fs.rmdirSync(filename, {recursive: true});
                } else {
                    fs.unlinkSync(filename);
                }
            }
            await fs.rmdirSync(config.installPath, {recursive: true});
        }

        await fs.mkdirSync(config.installPath);
        await fs.mkdirSync(path.join(config.installPath, 'temp_installer')); // 경로를 한번 쓰고 말아서 변수처리 안함 --
        await fs.mkdirSync(dl_path);
        await fs.mkdirSync(upk_path);

        // 스크립트 폴더
        if (await fs.existsSync(scripts_upk)) {
            let fdList = fs.readdirSync(scripts_upk);
            for (let i = 0; i < fdList.length; i++) {
                let filename = path.join(scripts_upk, fdList[i]);
                let stat = fs.statSync(filename);

                if(filename === "." || filename === "..") {
                    //
                } else if(stat.isDirectory()) {
                    fs.rmdirSync(filename, {recursive: true});
                } else {
                    fs.unlinkSync(filename);
                }
            }
            await fs.rmdirSync(scripts_upk, {recursive: true});
        }
        //await fs.mkdirSync(scripts_upk);
    } catch (err) {
        contents.send('installMessage', {
            percentage: 100,
            message: lang.install.infoMsg.folderInit.failed
        });
        contents.send('installMessage', {
            percentage: 100,
            message: `\nLOG : ERR on folderInit -> ${err}`
        });
        installSuccess = false;
        return await installingFinish(contents, notify, lang);
    }
    await wait(30);
    contents.send('installMessage', {
        percentage: 20,
        message: lang.install.infoMsg.folderInit.success
    });

    await wait(300);
    let prList = ["Core", "List", "Monitor", "Configurator", "Controller", "Scripts"];
    // TODO 2021-03-27: 이거 반복문이라,,,,,,, 이대로 실행하면 진행바가 날뛰게 되는데 대체
    // TODO 2021-05-09: 미친 이거 결국 작업 안했네
    for (let i = 0; i < prList.length; i++) {
        // prList[i]
        // filePath.install.infoMsg.PG[prList[i]]
        // serverConfig
        contents.send('installMessage', {
            percentage: 25,
            message: lang.install.infoMsg.fileDownload.working.replace('%PROGRAMNAME%', lang.install.infoMsg.PG[prList[i]])
        });
        await console.log(`${prList[i]} DL : ${serverConfig.files[prList[i]].url}`);
        try {
            await FM.downloadFile(serverConfig.files[prList[i]].url, path.join(dl_path, `${prList[i]}.adrdownload`), true);
        } catch (err) {
            contents.send('installMessage', {
                percentage: 100,
                message: lang.install.infoMsg.fileDownload.failed.replace('%PROGRAMNAME%', lang.install.infoMsg.PG[prList[i]])
            });
            contents.send('installMessage', {
                percentage: 100,
                message: `\nLOG : ${prList[i]} DL Error : ${err.toString()}`
            });
            installSuccess = false;
            return await installingFinish(contents, notify, lang);
        }
        contents.send('installMessage', {
            percentage: 40,
            message: lang.install.infoMsg.fileDownload.success.replace('%PROGRAMNAME%', lang.install.infoMsg.PG[prList[i]])
        });

        await wait(50);

        if (serverConfig.files[prList[i]].hash['SHA-1'] === "bypass") {
            console.log(`SHA-1 ${prList[i]} checksum bypass.`);
        } else {
            let res1 = await FM.checkHash(path.join(dl_path, `${prList[i]}.adrdownload`), 'sha1', serverConfig.files[prList[i]].hash['SHA-1']);
            if (res1[0]) {
                console.log(`SHA-1 ${prList[i]} checksum success.`);
            } else {
                console.log(`SHA-1 ${prList[i]} checksum is NOT EQUAL!!!`);
                console.log(`Remote : ${res1[2]}`);
                console.log(`Local : ${res1[1]}`);
                contents.send('installMessage', {
                    percentage: 100,
                    message: lang.install.infoMsg.fileCheck.failed
                });
                contents.send('installMessage', {
                    percentage: 100,
                    message: `\nLOG : SHA-1 ${prList[i]} checksum is NOT EQUAL!!!\nRemote : ${res1[2]}\nLocal : ${res1[1]}`
                });
                installSuccess = false;
                return await installingFinish(contents, notify, lang);
            }
        }
        if (serverConfig.files[prList[i]].hash['MD5'] === "bypass") {
            console.log(`MD5 ${prList[i]} checksum bypass.`);
        } else {
            let res2 = await FM.checkHash(path.join(dl_path, `${prList[i]}.adrdownload`), 'md5', serverConfig.files[prList[i]].hash['MD5']);
            if (res2[0]) {
                console.log(`MD5 ${prList[i]} checksum success.`);
            } else {
                console.log(`MD5 ${prList[i]} checksum is NOT EQUAL!!!`);
                console.log(`Remote : ${res2[2]}`);
                console.log(`Local : ${res2[1]}`);
                contents.send('installMessage', {
                    percentage: 100,
                    message: lang.install.infoMsg.fileCheck.failed
                });
                contents.send('installMessage', {
                    percentage: 100,
                    message: `\nLOG : MD5 ${prList[i]} checksum is NOT EQUAL!!!\nRemote : ${res2[2]}\nLocal : ${res2[1]}`
                });
                installSuccess = false;
                return await installingFinish(contents, notify, lang);
            }
        }
        contents.send('installMessage', {
            percentage: 45,
            message: lang.install.infoMsg.fileCheck.success
        });
        await wait(30);

        contents.send('installMessage', {
            percentage: 50,
            message: lang.install.infoMsg.fileUnpack.working.replace('%PROGRAMNAME%', lang.install.infoMsg.PG[prList[i]])
        });
        //config.installPath
        let now_path;
        if (prList[i] === "Scripts") {
            now_path = path.join(serverConfig.files[prList[i]].unpack);
            //now_path = scripts_upk; // 임시 폴더에 압축해제 미사용 경우
        } else {
            now_path = path.join(upk_path, serverConfig.files[prList[i]].unpack.replace('%INSTALLPATH%/', ''));
            //now_path = path.join(config.installPath, serverConfig.files[prList[i]].unpack.replace('%INSTALLPATH%/', '')); // 임시 폴더에 압축해제 미사용 경우
        }
        try {
            await fs.mkdirSync(now_path);
            await FM.unPack(path.join(dl_path, `${prList[i]}.adrdownload`), now_path);
        } catch (err) {
            contents.send('installMessage', {
                percentage: 100,
                message: lang.install.infoMsg.fileUnpack.failed.replace('%PROGRAMNAME%', lang.install.infoMsg.PG[prList[i]])
            });
            contents.send('installMessage', {
                percentage: 100,
                message: `\nLOG : ${prList[i]} UPK Error : ${err.toString()}`
            });
            installSuccess = false;
            return await installingFinish(contents, notify, lang);
        }
        contents.send('installMessage', {
            percentage: 60,
            message: lang.install.infoMsg.fileUnpack.success
        });

        await wait(500);
    }

    contents.send('installMessage', {
        percentage: 0,
        message: lang.install.infoMsg.fileMove.working
    });
    let mv_prList = ["Core", "List", "Monitor", "Configurator", "Controller"];
    // TODO 2021-03-27: 이거 반복문이라,,,,,,, 이대로 실행하면 진행바가 날뛰게 되는데 대체
    // TODO 2021-05-09: 미친 이거 결국 작업 안했네
    for (let i = 0; i < mv_prList.length; i++) {
        try {
            console.log(`${path.join(upk_path, serverConfig.files[mv_prList[i]].unpack.replace('%INSTALLPATH%/', ''))} -> ${config.installPath}`)
            await FM.mv(path.join(upk_path, serverConfig.files[mv_prList[i]].unpack.replace('%INSTALLPATH%/', '')), config.installPath);
            //await FM.mv(upk_path, config.installPath);
        } catch (err) {
            contents.send('installMessage', {
                percentage: 0,
                message: lang.install.infoMsg.fileMove.failed
            });
            contents.send('installMessage', {
                percentage: 0,
                message: `\nLOG : ERR on folderMove ${mv_prList[i]} -> ${err}`
            });
            installSuccess = false;
            return await installingFinish(contents, notify, lang);
        }
    }
    contents.send('installMessage', {
        percentage: 0,
        message: lang.install.infoMsg.fileMove.success
    });

    await wait(500);

    contents.send('installMessage', {
        percentage: 65,
        message: lang.install.infoMsg.writeSetting.working
    });
    await wait(30);
    try {
        const isPortAvailable = async port => {
            let res = await find('port', port);
            return !res.length;
        }
        let port1, port2;
        let loop = true;
        while (loop) {
            for (let i = 0; i < 5; i++) {
                port1 = randomInt(1024, 65535);
                let portAvail1 = await isPortAvailable(port1);
                port2 = randomInt(1024, 65535);
                let portAvail2 = await isPortAvailable(port2);
                if (portAvail1 && portAvail2) {
                    loop = false;
                    break;
                }
            }
        }
        let settingData = {
            "mode": "Pub",
            "ws": {
                "External": port1,
                "Internal": port2
            },
            "lang": config.language,
            "log": {
                "save_fd": "./logs/",
                "list": {
                    "installer": "installer.log",
                    "monitor": "monitor.log",
                    "sysInf": "sys.log",
                    "core": "core.log",
                    "configurator": "configurator.log",
                    "unknown": "unk.log"
                }
            },
            "reloadTick": {
                "Dev": {
                    "processNF": 5000,
                    "updateRPC": 5000
                },
                "Pub": {
                    "processNF": 15000,
                    "updateRPC": 10000
                }
            },
            "useProgramInfo": ["RPCInfo_Official"]
        };
        let text = JSON.stringify(settingData);
        fs.writeFileSync(path.join(config.installPath, 'data', 'Settings.json'), text);
    } catch (err) {
        contents.send('installMessage', {
            percentage: 100,
            message: lang.install.infoMsg.writeSetting.failed
        });
        contents.send('installMessage', {
            percentage: 100,
            message: `\nLOG : ERR on makeSettings -> ${err}`
        });
        installSuccess = false;
        return await installingFinish(contents, notify, lang);
    }
    contents.send('installMessage', {
        percentage: 70,
        message: lang.install.infoMsg.writeSetting.success
    });

    await wait(500);

    contents.send('installMessage', {
        percentage: 75,
        message: lang.install.infoMsg.writeRegs.working
    });
    await wait(30);
    try {
        // TODO 2021-05-09: 주석 안에 해놨음
        await reg.init(config.installPath, {
            release: serverConfig.updated,
            Core: serverConfig.files.Core.regVer,
            Monitor: serverConfig.files.Monitor.regVer,
            Configurator: serverConfig.files.Configurator.regVer,
            Controller: serverConfig.files.Controller.regVer,
            StartMenu: config.startMenuFolderUse,
            Startup: config.startWithWindows,
            Desktop: config.desktopShortcut
        }, {
            ModifyPath: `${path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'adobe-discord-rpc_controller.exe')} --Configurator`,
            UninstallPath: `${path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'adobe-discord-rpc_controller.exe')} --Configurator-Delete`
        });
    } catch (err) {
        contents.send('installMessage', {
            percentage: 100,
            message: lang.install.infoMsg.writeRegs.failed
        });
        contents.send('installMessage', {
            percentage: 100,
            message: `\nLOG : ERR on regInit -> ${err}`
        });
        installSuccess = false;
        return await installingFinish(contents, notify, lang);
    }
    contents.send('installMessage', {
        percentage: 80,
        message: lang.install.infoMsg.writeRegs.success
    });

    await wait(500);

    // https://www.npmjs.com/package/create-desktop-shortcuts

    if (config.startMenuFolderUse) {
        contents.send('installMessage', {
            percentage: 80,
            message: lang.install.infoMsg.startMenuShortCut.working
        });
        await wait(30);

        contents.send('installMessage', {
            percentage: 80,
            message: "시작메뉴 폴더 바로가기 생성은 현재 지원하지 않습니다."
        });

        // %PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs\Adobe Discord RPC
        if (await fs.existsSync(startMenu_path.replace('%PROGRAMDATA%', 'C:\\ProgramData'))) {
            let fdList = fs.readdirSync(startMenu_path.replace('%PROGRAMDATA%', 'C:\\ProgramData'));
            for (let i = 0; i < fdList.length; i++) {
                let filename = path.join(startMenu_path.replace('%PROGRAMDATA%', 'C:\\ProgramData'), fdList[i]);
                let stat = fs.statSync(filename);

                if(filename === "." || filename === "..") {
                    //
                } else if(stat.isDirectory()) {
                    fs.rmdirSync(filename, {recursive: true});
                } else {
                    fs.unlinkSync(filename);
                }
            }
            await fs.rmdirSync(startMenu_path.replace('%PROGRAMDATA%', 'C:\\ProgramData'), {recursive: true});
        }
        await fs.mkdirSync(startMenu_path.replace('%PROGRAMDATA%', 'C:\\ProgramData'));

        try {
            await createShortcut({
                //filePath: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'adobe-discord-rpc_controller.exe'),
                filePath: path.join(config.installPath, serverConfig.files.Monitor.unpack.replace('%INSTALLPATH%/', ''), 'ADRPC_Monitor.exe'),
                outputPath: startMenu_path,
                name: lang.install.shortCut.startMenu.run.name,
                comment: lang.install.shortCut.startMenu.comment,
                icon: path.join(config.installPath, serverConfig.files.Configurator.unpack.replace('%INSTALLPATH%/', ''), 'icon_alpha.ico'),
                //arguments: '--Monitor',
                windowMode: 'minimized'
            });
            await createShortcut({
                filePath: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'adobe-discord-rpc_controller.exe'),
                outputPath: startMenu_path,
                name: lang.install.shortCut.startMenu.exit.name,
                comment: lang.install.shortCut.startMenu.exit.comment,
                icon: path.join(config.installPath, serverConfig.files.Configurator.unpack.replace('%INSTALLPATH%/', ''), 'icon_alpha.ico'), //TODO
                arguments: '--Monitor-Kill',
                windowMode: 'minimized'
            });
            await createShortcut({
                //filePath: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'adobe-discord-rpc_controller.exe'),
                filePath: path.join(config.installPath, serverConfig.files.Configurator.unpack.replace('%INSTALLPATH%/', ''), 'ADRPC_Configurator.exe'),
                outputPath: startMenu_path,
                name: lang.install.shortCut.startMenu.configurator.name,
                comment: lang.install.shortCut.startMenu.configurator.comment,
                icon: path.join(config.installPath, serverConfig.files.Configurator.unpack.replace('%INSTALLPATH%/', ''), 'configurator.ico'),
                //arguments: '--Configurator',
                windowMode: 'minimized'
            });
            //await createShortcut({
            //    //filePath: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'adobe-discord-rpc_controller.exe'),
            //    filePath: path.join(config.installPath, serverConfig.files.Configurator.unpack.replace('%INSTALLPATH%/', ''), 'ADRPC_Configurator.exe'),
            //    outputPath: startMenu_path,
            //    name: lang.install.shortCut.startMenu.setting.name,
            //    comment: lang.install.shortCut.startMenu.setting.comment,
            //    icon: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'configurator.ico'),
            //    arguments: '--Configurator-Setup',
            //    windowMode: 'minimized'
            //});
            //await createShortcut({
            //    //filePath: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'adobe-discord-rpc_controller.exe'),
            //    filePath: path.join(config.installPath, serverConfig.files.Configurator.unpack.replace('%INSTALLPATH%/', ''), 'ADRPC_Configurator.exe'),
            //    outputPath: startMenu_path,
            //    name: lang.install.shortCut.startMenu.update.name,
            //    comment: lang.install.shortCut.startMenu.update.comment,
            //    icon: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'updater.ico'),
            //    arguments: '--Configurator-Update',
            //    windowMode: 'minimized'
            //});
            //await createShortcut({
            //    //filePath: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'adobe-discord-rpc_controller.exe'),
            //    filePath: path.join(config.installPath, serverConfig.files.Configurator.unpack.replace('%INSTALLPATH%/', ''), 'ADRPC_Configurator.exe'),
            //    outputPath: startMenu_path,
            //    name: lang.install.shortCut.startMenu.delete.name,
            //    comment: lang.install.shortCut.startMenu.delete.comment,
            //    //icon: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'configurator.ico'), // TODO
            //    arguments: '--Configurator-Delete',
            //    windowMode: 'minimized'
            //});
            await createShortcut({
                filePath: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'adobe-discord-rpc_controller.exe'),
                outputPath: startMenu_path,
                name: lang.install.shortCut.startMenu.homepage.name,
                comment: lang.install.shortCut.startMenu.homepage.comment,
                icon: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'icon_alpha.ico'), //TODO
                arguments: '--OpenWin-HP',
                windowMode: 'minimized'
            });
            await createShortcut({
                filePath: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'adobe-discord-rpc_controller.exe'),
                outputPath: startMenu_path,
                name: lang.install.shortCut.startMenu.official_discord.name,
                comment: lang.install.shortCut.startMenu.official_discord.comment,
                icon: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'icon_alpha.ico'), //TODO
                arguments: '--OpenWin-Official',
                windowMode: 'minimized'
            });
        } catch (err) {
            contents.send('installMessage', {
                percentage: 100,
                message: lang.install.infoMsg.startMenuShortCut.failed
            });
            contents.send('installMessage', {
                percentage: 100,
                message: `\nLOG : ERR on createShortcut -> ${err}`
            });
            installSuccess = false;
            return await installingFinish(contents, notify, lang);
        }
        contents.send('installMessage', {
            percentage: 85,
            message: lang.install.infoMsg.startMenuShortCut.success
        });
    }

    if (config.startWithWindows) {
        contents.send('installMessage', {
            percentage: 85,
            message: lang.install.infoMsg.startup.working
        });
        // %PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs\Startup
        try {
            await createShortcut({
                //filePath: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'adobe-discord-rpc_controller.exe'),
                filePath: path.join(config.installPath, serverConfig.files.Monitor.unpack.replace('%INSTALLPATH%/', ''), 'ADRPC_Monitor.exe'),
                outputPath: startup_path,
                name: 'Run Adobe Discord RPC',
                icon: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'icon_alpha.ico'),
                //arguments: '--Configurator',
                windowMode: 'minimized'
            });
        } catch (err) {
            contents.send('installMessage', {
                percentage: 100,
                message: lang.install.infoMsg.startup.failed
            });
            contents.send('installMessage', {
                percentage: 100,
                message: `\nLOG : ERR on createShortcut -> ${err}`
            });
            installSuccess = false;
            return await installingFinish(contents, notify, lang);
        }
        contents.send('installMessage', {
            percentage: 90,
            message: lang.install.infoMsg.startup.success
        });
    }

    if (config.desktopShortcut) {
        contents.send('installMessage', {
            percentage: 90,
            message: lang.install.infoMsg.desktopShortCut.working
        });
        await wait(30);
        try {
            await createShortcut({
                //filePath: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'adobe-discord-rpc_controller.exe'),
                filePath: path.join(config.installPath, serverConfig.files.Monitor.unpack.replace('%INSTALLPATH%/', ''), 'ADRPC_Monitor.exe'),
                name: lang.install.shortCut.startMenu.run.name,
                comment: lang.install.shortCut.startMenu.run.comment,
                icon: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'monitor.ico'),
                //arguments: '--Monitor',
                windowMode: 'minimized'
            });
            await createShortcut({
                //filePath: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'adobe-discord-rpc_controller.exe'),
                filePath: path.join(config.installPath, serverConfig.files.Configurator.unpack.replace('%INSTALLPATH%/', ''), 'ADRPC_Configurator.exe'),
                name: lang.install.shortCut.startMenu.setting.name,
                comment: lang.install.shortCut.startMenu.setting.comment,
                icon: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'configurator.ico'),
                //arguments: '--Configurator-Setup',
                windowMode: 'minimized'
            });
            //await createShortcut({
            //    filePath: path.join(config.installPath, serverConfig.files.Controller.unpack.replace('%INSTALLPATH%/', ''), 'adobe-discord-rpc_controller.exe'),
            //    name: lang.install.shortCut.startMenu.update.name,
            //    comment: lang.install.shortCut.startMenu.update.comment,
            //    icon: path.join(config.installPath, serverConfig.files.Monitor.unpack.replace('%INSTALLPATH%/', ''), 'updater.ico'),
            //    arguments: '--Configurator-Update',
            //    windowMode: 'minimized'
            //});
        } catch (err) {
            contents.send('installMessage', {
                percentage: 100,
                message: lang.install.infoMsg.desktopShortCut.failed
            });
            contents.send('installMessage', {
                percentage: 100,
                message: `\nLOG : ERR on createShortcut -> ${err}`
            });
            installSuccess = false;
            return await installingFinish(contents, notify, lang);
        }
        contents.send('installMessage', {
            percentage: 95,
            message: lang.install.infoMsg.desktopShortCut.success
        });
    }

    await wait(500);
    await installingFinish(contents, notify, lang);

    // setTimeout(() => {
    //     contents.send('installMessage', {
    //         percentage: 100,
    //         message: 'install finish'
    //     });
    //     contents.send('installFinish', 0);
    //     window.removeAllListeners('minimize');
    //     if (notify) new Notification({
    //         title: lang['installNotify']['title'],
    //         body: `${lang['installNotify']['finish']}`,
    //         icon: path.join(__dirname, 'images', 'icon.png')
    //     }).show();
    // }, 10000);
    // contents.send('installMessage', {
    //     percentage: 0,
    //     message: 'install start'
    // });
    // contents.send('installFinish', 0);
};

const installFinish = async () => {
    if (installSuccess) await window.loadFile(path.join(__dirname, 'views', 'install_complete.html'));
    else await window.loadFile(path.join(__dirname, 'views', 'install_fail.html'));
};

// functions
const checkInternetConnection = async () => {
    try {
        await cic({
            timeout: 3000,
            retries: 3,
            domain: 'https://cdn.discordrpc.org/'
        });
        return true;
    } catch (e) {
        return false;
    }
};

const startInternetAlert = async () => {
    let res = await dialog.showMessageBox({
        type: 'error',
        buttons: ['Support', 'Close'],
        title: 'Adobe Discord RPC Installer - Error!',
        message: '서버에 연결할 수 없습니다.\nThere was a problem connecting to the server.',
        noLink: false
    });
    switch (res.response) {
        case 0: // support
            await open('https://discord.gg/7MBYbERafX');
            process.exit(0);
            return;
        default: // close
            process.exit(0);
            return;
    }
};

const startPrivilegeAlert = async () => {
    let res = await dialog.showMessageBox({
        type: 'error',
        buttons: ['Support', 'Close'],
        title: 'Adobe Discord RPC Installer - Error!',
        message: '프로그램이 관리자 권한으로 실행되지 않았습니다.\nThe program did not run with administrator privileges.',
        noLink: false
    });
    switch (res.response) {
        case 0: // support
            await open('https://discord.gg/7MBYbERafX');
            process.exit(0);
            return;
        default: // close
            process.exit(0);
            return;
    }
};

ipcMain.on('getLang', (event, res) => {
    if (res === 0) res = config.language;
    let filePath = path.join(__dirname, 'lang', `${res}.json`);
    try {
        if (fs.statSync(filePath).isFile()) event.returnValue = require(filePath);
        else event.returnValue = undefined;
    } catch (e) {
        console.log(e);
        event.returnValue = undefined;
    }
});

ipcMain.on('getLicense', async (event, res) => {
    if (res === 0) res = config.language;
    let requestURL = serverConfig['license'][res];
    event.returnValue = (await request.getJson(requestURL))['msg'];
});

ipcMain.on('getPrivacy', async (event, res) => {
    if (res === 0) res = config.language;
    let requestURL = serverConfig['privacy'][res];
    event.returnValue = (await request.getJson(requestURL))['msg'];
});

ipcMain.on('licenseNext', (event, res) => {
    config.licenseAgree = true;
    window.loadFile(path.join(__dirname, 'views', 'option_3_privacy.html'));
});

ipcMain.on('privacyNext', (event, res) => {
    config.privacyAgree = true;
    window.loadFile(path.join(__dirname, 'views', 'option_4_select_option.html'));
});

ipcMain.on('checkOption', (event, res) => {
    if (typeof res.startWithWindows === 'boolean') config.startWithWindows = res.startWithWindows;
    if (typeof res.desktopShortcut === 'boolean') config.desktopShortcut = res.desktopShortcut;
    window.loadFile(path.join(__dirname, 'views', 'option_5_startup.html'));
});

ipcMain.on('setStartMenu', (event, res) => {
    if (typeof res.folderUse === 'boolean') config.startMenuFolderUse = res.folderUse;
    if (res.folderUse && typeof res.startMenuFolder === 'string') config.startMenuFolder = res.startMenuFolder;
    if (config.startMenuFolder === '') config.startMenuFolder = 'Adobe Discord RPC';
    window.loadFile(path.join(__dirname, 'views', 'option_6_install_path.html'));
});

ipcMain.on('selectFolder', async (event, res) => {
    const folder = await dialog.showOpenDialog(window, {
        properties: ['openDirectory']
    });
    if (folder.filePaths.length !== 0) res = folder.filePaths[0];
    config.installPath = res;
    event.returnValue = res;
});

ipcMain.on('installStart', (event, res) => {
    installing();
});

ipcMain.on('finish', (event, res) => {
    installFinish();
});

ipcMain.on('getInstallOption', (event, res) => {
    event.returnValue = config;
});

ipcMain.on('installExit', (event, res) => {
    app.quit();
    process.exit(0);
});

ipcMain.on('installFinish', async (event, res) => {
    window.destroy();
    if (res.openGithub) open('https://github.com/Adobe-Discord-RPC');
    if (res.openDiscord) open('https://discord.gg/7MBYbERafX');
    if (res.runProgram) {
        child.exec(`"${path.join(config.installPath, serverConfig.files.Monitor.unpack.replace('%INSTALLPATH%/', ''))}, 'ADRPC_Monitor.exe')"`, async (error, stdout, stderr) => {
            if (error) {
                return;
            }
        });
    }
});

// electron
app.whenReady().then(async () => {
    // init
    app.setName('Adobe Discord RPC Installer');
    app.setAppUserModelId('Adobe Discord RPC Installer');

    child.exec('NET SESSION', async function(err,so,se) {
        if (se.length !== 0) {
            console.log("The process is not running with administrator privileges!");
            await startPrivilegeAlert();
            app.quit();
        } else {
            if (await checkInternetConnection()) {
                serverConfig = await request.getJson('https://cdn.discordrpc.org/2021050901/Install/index.json');
                window = new BrowserWindow(windowOption);
                window.on('close', (event) => {
                    event.preventDefault();
                    let contents = window.webContents;
                    contents.send('exitModal', 0);
                });
                await checkLanguage();
            } else {
                await startInternetAlert();
                app.quit();
            }
        }
    });
});
