/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2019 alextrv
 * Copyright (c) 2015 erkserkserks
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

(function() {
    const DEBUG = false;

    function log(...args) {
        if (DEBUG) console.log(...args);
    }

    function logTable(data) {
        if (DEBUG && data.length > 0) console.table(data);
    }

    const requestCache = new Map();
    const pendingRequests = new Map();
    const urlCache = new Map();

    function extractVideoId(url) {
        if (urlCache.has(url)) {
            return urlCache.get(url);
        }

        let vid = new URL(url).searchParams.get("v");
        if (vid) {
            urlCache.set(url, vid);
            return vid;
        }

        const shortsMatch = url.match(/\/shorts\/([^?]+)/);
        if (shortsMatch) {
            vid = shortsMatch[1];
            urlCache.set(url, vid);
            return vid;
        }

        const embedMatch = url.match(/\/embed\/([^?]+)/);
        if (embedMatch) {
            vid = embedMatch[1];
            urlCache.set(url, vid);
            return vid;
        }

        urlCache.set(url, null);
        return null;
    }

    const parseTypeCache = new Map();
    function parseMimeType(type) {
        if (parseTypeCache.has(type)) {
            return parseTypeCache.get(type);
        }

        if (type === undefined) {
            parseTypeCache.set(type, null);
            return null;
        }

        const match = type.match(/.+;\s*codecs="(.+)"/);
        const result = match ? match[1] : null;
        parseTypeCache.set(type, result);
        return result;
    }

    const framerateCache = new Map();
    function extractFramerate(type) {
        if (framerateCache.has(type)) {
            return framerateCache.get(type);
        }

        const match = /framerate=(\d+)/.exec(type);
        const result = match ? parseInt(match[1], 10) : null;
        framerateCache.set(type, result);
        return result;
    }

    function get_video_info(vid, callback) {
        const cacheKey = vid;

        if (requestCache.has(cacheKey)) {
            callback(requestCache.get(cacheKey));
            return;
        }

        if (pendingRequests.has(cacheKey)) {
            pendingRequests.get(cacheKey).push(callback);
            return;
        }

        pendingRequests.set(cacheKey, [callback]);

        const request = new XMLHttpRequest();
        request.open("POST", "https://www.youtube.com/youtubei/v1/player");

        request.setRequestHeader("Content-Type", "application/json");

        const payload = JSON.stringify({
            context: {
                client: {
                    clientName: "WEB",
                    clientVersion: "2.20230327.07.00",
                },
            },
            videoId: vid,
        });

        request.onreadystatechange = function() {
            if (request.readyState === 4) {
                let result = false;
                if (request.status === 200) {
                    try {
                        result = JSON.parse(request.responseText);
                    } catch (e) {
                        result = false;
                    }
                }

                requestCache.set(cacheKey, result);

                const callbacks = pendingRequests.get(cacheKey);
                pendingRequests.delete(cacheKey);

                for (const cb of callbacks) {
                    cb(result);
                }
            }
        };

        request.send(payload);
    }

    function makeModifiedTypeChecker(origChecker) {
        return function(type) {
            const original_type = type;
            const url = window.location.href;

            if (type === undefined) {
                return false;
            }

            const codecs = parseMimeType(type);
            if (!codecs) {
                return false;
            }

            if (url.includes("hyperchat_embed")) {
                return origChecker(original_type);
            }

            const vid = extractVideoId(url);
            if (!vid) {
                return origChecker(original_type);
            }

            const last_video_id = sessionData.get_last_id();
            const last_video_disallowed_types = sessionData.get_last_disallowed();
            const temp_value = sessionData.get_temp_value();

            if (vid === last_video_id && last_video_disallowed_types && temp_value) {
                disallowed_types = last_video_disallowed_types;
            } else {
                log(`vid change detected. new:[${vid}] old:[${last_video_id}] url:[${url}]`);

                get_video_info(vid, function(format_data) {
                    if (!format_data ||
                        !format_data.streamingData ||
                        !format_data.streamingData.adaptiveFormats ||
                        !format_data.playabilityStatus ||
                        format_data.playabilityStatus.status !== "OK"
                    ) {
                        sessionData.set_last_id(vid);
                        sessionData.set_last_disallowed([]);
                        sessionData.set_temp_value();
                        return;
                    }

                    const disallowed = get_disallowed_list(format_data, vid);
                    sessionData.set_last_id(vid);
                    sessionData.set_last_disallowed(disallowed);
                    sessionData.set_temp_value();

                    if (disallowed.length > 0) {
                        const videoElem = document.createElement("video");
                        videoElem.canPlayType(original_type);
                    }
                });

                return origChecker(original_type);
            }

            if (!disallowed_types || disallowed_types.length < 1) {
                return origChecker(original_type);
            }

            disallowed_types = new Set(disallowed_types);

            const reg_match_codec = codecs_util.get_reg_match(codecs);
            if (disallowed_types.has(reg_match_codec)) {
                return false;
            }

            if (localStorage["enhanced-h264ify-block_60fps"] === "true") {
                const framerate = extractFramerate(original_type);
                if (framerate !== null && framerate > 30) {
                    return false;
                }
            }

            return origChecker(original_type);
        };
    }

    let disallowed_types = [];

    function override() {
        var videoElem = document.createElement("video");
        var origCanPlayType = videoElem.canPlayType.bind(videoElem);
        videoElem.__proto__.canPlayType = makeModifiedTypeChecker(origCanPlayType);

        var mse = window.MediaSource;
        if (mse === undefined) return;
        var origIsTypeSupported = mse.isTypeSupported.bind(mse);
        mse.isTypeSupported = makeModifiedTypeChecker(origIsTypeSupported);
    }

    let batteryCheckDone = false;

    function checkBatteryAndOverride() {
        if (batteryCheckDone) {
            override();
            return;
        }

        batteryCheckDone = true;

        if (localStorage["enhanced-h264ify-battery_only"] === "true" && navigator.getBattery) {
            navigator.getBattery().then(function(battery) {
                if (!battery.charging) {
                    override();
                }
            }).catch(function() {
                override();
            });
        } else {
            override();
        }
    }

    checkBatteryAndOverride();

    const sessionData = {
        id: {
            last_id: "enhanced-h264ify-last_id",
            last_disallowed: "enhanced-h264ify-last_disallowed",
            temp_value: "enhanced-h264ify-temp_value",
        },
        set_last_id(id = "") {
            if (typeof id === "string" && id.length > 0 && id.length < 15) {
                sessionStorage.setItem(this.id.last_id, id);
            } else {
                sessionStorage.removeItem(this.id.last_id);
            }
        },
        set_last_disallowed(list = []) {
            if (list instanceof Array) {
                sessionStorage.setItem(this.id.last_disallowed, JSON.stringify(list));
            } else {
                sessionStorage.removeItem(this.id.last_disallowed);
            }
        },
        set_temp_value() {
            sessionStorage.setItem(this.id.temp_value, "auto_expired");
            setTimeout(() => sessionStorage.removeItem(this.id.temp_value), 5000);
        },
        get_last_id() {
            let id = sessionStorage.getItem(this.id.last_id);
            return typeof id === "string" && id.length > 0 ? id : false;
        },
        get_last_disallowed() {
            try {
                let list = JSON.parse(sessionStorage.getItem(this.id.last_disallowed));
                return list instanceof Array ? list : false;
            } catch (e) {
                return false;
            }
        },
        get_temp_value() {
            return sessionStorage.getItem(this.id.temp_value);
        },
    };

    const codecs_util = {
        video_list: ["avc", "av1", "vp8", "vp9"],
        audio_list: ["opus", "mp4a"],
        all_format: ["avc", "av1", "vp8", "vp9", "opus", "mp4a"],
        video_map: {
            avc: "h264",
            av1: "av1",
            vp8: "vp8",
            vp9: "vp9",
        },
        audio_map: {
            opus: "opus",
            mp4a: "mp4a",
        },
        reg: {
            avc: /avc\d+/,
            av1: /av\d+/,
            vp8: /vp8/,
            vp9: /vp9|vp09/,
            opus: /opus/,
            mp4a: /mp4a/,
        },
        get_reg_match(string = "") {
            for (let [key, reg] of Object.entries(this.reg)) {
                if (string.match(reg)) return key;
            }
            log(`no reg match for [${string}]`);
            return false;
        },
        is_audio(string = "") {
            return this.audio_list.includes(string);
        },
    };

    function get_disallowed_list(format_data, vid) {
        const format_data_array = format_data.streamingData.adaptiveFormats;

        const resolution_data = {
            avc: 0, av1: 0, vp8: 0, vp9: 0
        };
        const codecs_data = {
            avc: new Set(),
            av1: new Set(),
            vp8: new Set(),
            vp9: new Set(),
            opus: new Set(),
            mp4a: new Set()
        };

        let max_resolution = 0;
        const table = [];

        for (let i = 0; i < format_data_array.length; i++) {
            const data = format_data_array[i];
            const mimeType = data.mimeType;

            const codecs = parseMimeType(mimeType);
            if (!codecs) continue;

            const codec_key = codecs_util.get_reg_match(codecs);
            if (!codec_key) {
                log("unknown codec, pass", { codec_key, data });
                continue;
            }

            codecs_data[codec_key].add(codecs);

            if (data.height) {
                if (data.height > max_resolution) max_resolution = data.height;
                if (data.height > resolution_data[codec_key]) {
                    resolution_data[codec_key] = data.height;
                }
                table.push({
                    codec_key,
                    codecs,
                    width: data.width,
                    height: data.height,
                    qualityLabel: data.qualityLabel,
                    bitrate: data.bitrate
                });
            }
        }

        logTable(table);

        if (localStorage["enhanced-h264ify-max_res"] === "true") {
            let target_max_resolution = max_resolution;
            if (localStorage["enhanced-h264ify-res_setting"] !== "max") {
                target_max_resolution = parseInt(localStorage["enhanced-h264ify-res_setting"], 10);
            }

            log("max_resolution", target_max_resolution, "resolution_data", resolution_data);

            for (const key of Object.keys(resolution_data)) {
                if (target_max_resolution > resolution_data[key]) {
                    if (resolution_data[key] > 0) {
                        log(`${key} lacks ${target_max_resolution}p info. discard ${key} from exclusion list.`);
                    }
                    delete codecs_data[key];
                }
            }
        }

        let available_video_codec = 0;
        let available_audio_codec = 0;

        for (const key of Object.keys(codecs_data)) {
            if (codecs_data[key].size === 0) {
                delete codecs_data[key];
            } else if (codecs_util.is_audio(key)) {
                codecs_data[key].add(key);
                available_audio_codec++;
            } else {
                codecs_data[key].add(key);
                available_video_codec++;
            }
        }

        log(`available_video_codec:${available_video_codec}, available_audio_codec:${available_audio_codec}`);

        let disallowed_types = [];

        if (available_video_codec > 1) {
            for (const [key, name] of Object.entries(codecs_util.video_map)) {
                if (localStorage[`enhanced-h264ify-block_${name}`] === "true") {
                    if (codecs_data[key]) {
                        log(`blocking ${key}`);
                        const arr = Array.from(codecs_data[key]);
                        for (let i = 0; i < arr.length; i++) {
                            disallowed_types.push(arr[i]);
                        }
                        available_video_codec--;
                    }
                    if (available_video_codec <= 1) {
                        log(`no video codec left. skip`);
                        break;
                    }
                }
            }
        } else {
            log(`only 1 video codec available. skip`);
        }

        if (available_audio_codec > 1) {
            for (const [key, name] of Object.entries(codecs_util.audio_map)) {
                if (localStorage[`enhanced-h264ify-block_${name}`] === "true") {
                    if (codecs_data[key]) {
                        log(`blocking ${key}`);
                        const arr = Array.from(codecs_data[key]);
                        for (let i = 0; i < arr.length; i++) {
                            disallowed_types.push(arr[i]);
                        }
                        available_audio_codec--;
                    }
                    if (available_audio_codec <= 1) {
                        log(`no audio codec left. skip`);
                        break;
                    }
                }
            }
        } else {
            log(`only 1 audio codec available. skip`);
        }

        log(`new video id:[${vid}], codecs_data:`, codecs_data);
        log("disallowed_types", disallowed_types);

        return disallowed_types;
    }
})();