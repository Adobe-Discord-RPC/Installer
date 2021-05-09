const regedit = require('regedit');

module.exports.list = function (keys) { // 짜피 받아올 key 한개임;;
    return new Promise((resolve, reject) => {
        regedit.list(keys, (err, result) => {
            if (err) reject(err);
            else resolve(result[keys].values);
        });
    });
};
