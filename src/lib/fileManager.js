const PowerShell = require("powershell");
const sevenBin = require('7zip-bin');
const Seven = require('node-7z');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const fs = require('fs');

module.exports.downloadFile = function (url, path, isSecure=false) { // isSecure : SSL 사용여부
    return new Promise((resolve, reject) => {
        let file = fs.createWriteStream(path);
        let request = undefined;

        if (isSecure) {
            request = https.get(url, (response) => {
                // check if response is success
                if (response.statusCode !== 200) {
                    return reject(`Status ${response.statusCode}`);
                }

                response.pipe(file);
            });
        } else {
            request = http.get(url, (response) => {
                // check if response is success
                if (response.statusCode !== 200) {
                    return reject(`Status ${response.statusCode}`);
                }

                response.pipe(file);
            });
        }

        file.on('finish', () => {
            file.close();
            resolve();
        });

        // check for request error too
        request.on('error', (err) => {
            fs.unlink(path);
            reject(err.message);
        });

        file.on('error', (err) => { // Handle errors
            fs.unlink(path);
            reject(err.message);
        });
    });
}

// 무결성
module.exports.checkHash = function (filename, algorithm, expected) {
    return new Promise((resolve, reject) => {
        fs.readFile(filename, function(err, data) {
            if (err) reject(err);
            let hash = crypto.createHash(algorithm)
                .update(data)
                .digest('hex');
            if (hash === expected.toLowerCase()) {
                resolve([true]);
            } else {
                resolve([false, hash, expected.toLowerCase()]);
            }
        });
    });
}

// 압축해제
module.exports.unPack = function (target, destination) { // target : 압축파일
    return new Promise((resolve, reject) => {
        const myStream = Seven.extractFull(target, destination, {$bin: sevenBin.path7za});

        myStream.on('error', err => reject(err));

        myStream.on('end', () => resolve());
    });
}

// 파일 이동
module.exports.mv = function (source, dest) {
    return new Promise((resolve, reject) => {
        /*
         * PS C:\Windows\system32> help Move-Item
         *
         * NAME
         *     Move-Item
         *
         * SYNTAX
         *     Move-Item [-Path] <string[]> [[-Destination] <string>] [-Force] [-Filter <string>] [-Include <string[]>] [-Exclude
         *     <string[]>] [-PassThru] [-Credential <pscredential>] [-WhatIf] [-Confirm] [-UseTransaction]  [<CommonParameters>]
         *
         *     Move-Item [[-Destination] <string>] -LiteralPath <string[]> [-Force] [-Filter <string>] [-Include <string[]>]
         *     [-Exclude <string[]>] [-PassThru] [-Credential <pscredential>] [-WhatIf] [-Confirm] [-UseTransaction]
         *     [<CommonParameters>]
         *
         *
         * ALIASES
         *     mi
         *     mv
         *     move
         *
         *
         * REMARKS
         *     Get-Help cannot find the Help files for this cmdlet on this computer. It is displaying only partial help.
         *         -- To download and install Help files for the module that includes this cmdlet, use Update-Help.
         *         -- To view the Help topic for this cmdlet online, type: "Get-Help Move-Item -Online" or
         *            go to https://go.microsoft.com/fwlink/?LinkID=113350.
         *
         */

        let ps = new PowerShell(`Move-Item -Path "${source}" -Destination "${dest}" -Force`);

        // Handle process errors (e.g. powershell not found)
        ps.on("error", err => {
            reject(err);
        });

        // Stdout
        ps.on("output", data => { // data is result
            resolve(data);
        });

        // Stderr
        ps.on("error-output", data => {
            reject(data);
        });
    });
}