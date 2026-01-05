var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var dataJson;
window.setUpTelegramWebApp = function () {
    return __awaiter(this, void 0, void 0, function () {
        function load_data(path) {
            return __awaiter(this, void 0, void 0, function () {
                var res, data, error_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 4, , 5]);
                            return [4 /*yield*/, fetch(path, {
                                    method: 'GET',
                                    headers: { 'Content-Type': 'application/json' },
                                })];
                        case 1:
                            res = _a.sent();
                            return [4 /*yield*/, res.json()];
                        case 2:
                            data = _a.sent();
                            console.log(path, data.message);
                            return [4 /*yield*/, fetch('/api/submit-app-data', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        initData: tg_1.initData,
                                        logCode: path.split('/').at(-1),
                                        result: JSON.stringify(data.data),
                                        message_id: message_id_1,
                                        message: data.message,
                                    }),
                                })];
                        case 3:
                            _a.sent();
                            tg_1.close();
                            return [3 /*break*/, 5];
                        case 4:
                            error_1 = _a.sent();
                            console.error(error_1.message);
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/];
                    }
                });
            });
        }
        var path, search, tg_1, params, message_id_1, isSearch, $loading, loadingHTML_1, $searchBtn;
        return __generator(this, function (_a) {
            path = window.location.pathname;
            search = window.location.search;
            if (path.startsWith('/wl/') && window.Telegram && window.Telegram.WebApp) {
                tg_1 = window.Telegram.WebApp;
                params = new URLSearchParams(search);
                message_id_1 = params.get('message_id');
                isSearch = params.get('search') === 'true';
                if (isSearch) {
                    $loading = document.querySelector('#loading');
                    loadingHTML_1 = $loading.innerHTML;
                    $loading.innerHTML = /*html*/ "\n        <div class=\"search-section\">\n          <div class=\"d-flex justify-content-center\">\n            <input id=\"logCode\" type=\"text\" placeholder=\"\u179F\u17BC\u1798\u1794\u1789\u17D2\u1785\u17BC\u179B\u179B\u17C1\u1784\u1794\u17BB\u1784...\">\n            <button id=\"search\" class=\"btn-primary\">Search</button>\n          </div>\n          <div class=\"loading\"></div>\n        </div>\n      ";
                    $searchBtn = document.querySelector('button#search');
                    if ($searchBtn) {
                        $searchBtn.addEventListener('click', function () {
                            return __awaiter(this, void 0, void 0, function () {
                                var $loading, logCode;
                                var _a;
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0:
                                            $loading = document.querySelector('.search-section .loading');
                                            $loading.innerHTML = loadingHTML_1;
                                            logCode = (_a = document.querySelector('input#logCode')) === null || _a === void 0 ? void 0 : _a.value;
                                            if (!logCode) return [3 /*break*/, 2];
                                            return [4 /*yield*/, load_data("".concat(window.origin, "/wl/").concat(logCode))];
                                        case 1:
                                            _b.sent();
                                            _b.label = 2;
                                        case 2:
                                            $loading.innerHTML = '';
                                            return [2 /*return*/];
                                    }
                                });
                            });
                        });
                    }
                }
                else {
                    load_data(path);
                }
            }
            else {
                console.error('Telegram WebApp object not found. Running outside the Telegram client.');
            }
            return [2 /*return*/];
        });
    });
};
window.setUpTelegramWebApp();
