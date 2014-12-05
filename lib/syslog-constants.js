'use strict';

var Joi = require('joi');

module.exports = {
    VERSION: 1,
    NILVALUE: '-',
    LEVEL: {
        EMERG: 0,
        ALERT: 1,
        CRIT: 2,
        ERR: 3,
        WARNING: 4,
        NOTICE: 5,
        INFO: 6,
        DEBUG: 7
    },
    FACILITY: {
        KERN: 0,
        USER: 1,
        MAIL: 2,
        DAEMON: 3,
        AUTH: 4,
        SYSLOG: 5,
        LPR: 6,
        NEWS: 7,
        UUCP: 8,
        CLOCK: 9,
        AUTHPRIV: 10,
        FTP: 11,
        NTP: 12,
        LOG_AUDIT: 13,
        LOG_ALERT: 14,
        CRON: 15,
        LOCAL0: 16,
        LOCAL1: 17,
        LOCAL2: 18,
        LOCAL3: 19,
        LOCAL4: 20,
        LOCAL5: 21,
        LOCAL6: 22,
        LOCAL7: 23
    },
    SDID: {
        timeQuality: Joi.object().keys({
            tzKnown: Joi.number().integer().min(0).max(1),
            isSynced: Joi.number().integer().min(0).max(1),
            syncAccuracy: Joi.number().integer().min(0)
                .when('isSynced', { is: 0, then: Joi.any().forbidden() })
        }),
        origin: Joi.object().keys({
            ip: [
                Joi.string().hostname(),
                Joi.array().includes(
                    Joi.string().hostname()
                )
            ],
            enterpriseId: Joi.string().regex(/^\d+(\.\d+)*$/),
            software: Joi.string().min(1).max(48),
            swVersion: Joi.string().min(1).max(48)
        }),
        meta: Joi.object().keys({
            sequenceId: Joi.number().integer().min(1).max(2147483647),
            sysUpTime: Joi.number().integer().min(0),
            language: Joi.string()
        })
    }
};
