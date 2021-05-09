const {spawn} = require('child_process');

let command;

switch(process.platform) {
    case 'darwin':
        command = 'open';
        break;
    case 'win32':
        command = 'explorer.exe';
        break;
}

module.exports = (url) => {
    let child = spawn(command, [url]);
    child.stderr.setEncoding('utf8');
    child.stderr.on('end', function () {
        child.disconnect();
    });
}