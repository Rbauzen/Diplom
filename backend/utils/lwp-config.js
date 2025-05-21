// backend/utils/lwp-config.js
const LWP_UNITS_CONFIG = {
    MAP: {
        'таб.': 0,
        'капс.': 1,
        'амп.': 2,
        'мл': 3,
        'г': 4,
        'шт.': 5,
        'пакетик': 6,
        'суппозиторий': 7,
    },
    _list: null, // для кеширования
    get LIST() {
        if (!this._list) {
            this._list = Object.keys(this.MAP);
        }
        return this._list;
    }
};

module.exports = LWP_UNITS_CONFIG;