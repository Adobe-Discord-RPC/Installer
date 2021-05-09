const regedit = require('regedit');
const moment = require('moment');
const path = require('path');

module.exports.init = function (root, versions, runInf) {
    return new Promise((resolve, reject) => {
        regedit.createKey(['HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Adobe_Discord_RPC_NodePort'], function (err) {
            if (err) reject(err);
            regedit.putValue({
                'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Adobe_Discord_RPC_NodePort': {
                    'DisplayIcon': {
                        value: path.join(root, 'temp.ico'), // TODO
                        type: 'REG_SZ'
                    },
                    'DisplayName': {
                        value: 'Adobe Discord RPC',
                        type: 'REG_SZ'
                    },
                    'DisplayVersion': {
                        value: 'Release ' + versions.release,
                        type: 'REG_SZ'
                    },
                    'InstallDate': {
                        value: moment().format('YYYYMMDD'),
                        type: 'REG_SZ'
                    },
                    'Publisher': {
                        value: 'Adobe Discord RPC Team.',
                        type: 'REG_SZ'
                    },
                    //'UninstallString': {
                    //    value: runInf.UninstallPath,
                    //    type: 'REG_SZ'
                    //},
                    'URLInfoAbout': {
                        value: 'https://adobe.discordrpc.org/',
                        type: 'REG_SZ'
                    },
                    'HelpLink': {
                        value: 'https://adobe.discordrpc.org/',
                        type: 'REG_SZ'
                    },
                    //'ModifyPath': {
                    //    value: runInf.ModifyPath,
                    //    type: 'REG_SZ'
                    //},
                    'InstallLocation': {
                        value: root,
                        type: 'REG_SZ'
                    },
                    'ADRPC:Core_Version': {
                        value: versions.Core,
                        type: 'REG_SZ'
                    },
                    'ADRPC:Monitor_Version': {
                        value: versions.Monitor,
                        type: 'REG_SZ'
                    },
                    'ADRPC:Configurator_Version': {
                        value: versions.Configurator,
                        type: 'REG_SZ'
                    },
                    'ADRPC:Controller_Version': {
                        value: versions.Controller,
                        type: 'REG_SZ'
                    },
                    'ADRPC:StartMenuFolder': {
                        value: `${versions.StartMenu}`,
                        type: 'REG_SZ'
                    },
                    'ADRPC:StartWithWindows': {
                        value: `${versions.Startup}`,
                        type: 'REG_SZ'
                    },
                    'ADRPC:DesktopShortcut': {
                        value: `${versions.Desktop}`,
                        type: 'REG_SZ'
                    }
                },
            }, function (err) {
                console.log('2')
                if (err) reject(err);
                resolve();
            });
        });
    });
}