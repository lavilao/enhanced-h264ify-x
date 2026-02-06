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

// This content script runs in an isolated environment and cannot modify any
// javascript variables on the youtube page. Thus, we have to inject another
// script into the DOM.

// Set defaults for options stored in localStorage
if (localStorage['enhanced-h264ify-block_60fps'] === undefined) {
  localStorage['enhanced-h264ify-block_60fps'] = false;
}
if (localStorage['enhanced-h264ify-block_h264'] === undefined) {
  localStorage['enhanced-h264ify-block_h264'] = false;
}
if (localStorage['enhanced-h264ify-block_vp8'] === undefined) {
  localStorage['enhanced-h264ify-block_vp8'] = true;
}
if (localStorage['enhanced-h264ify-block_vp9'] === undefined) {
  localStorage['enhanced-h264ify-block_vp9'] = true;
}
if (localStorage['enhanced-h264ify-block_av1'] === undefined) {
  localStorage['enhanced-h264ify-block_av1'] = true;
}
if (localStorage['enhanced-h264ify-block_opus'] === undefined) {
  localStorage['enhanced-h264ify-block_opus'] = true;
}
if (localStorage['enhanced-h264ify-block_mp4a'] === undefined) {
  localStorage['enhanced-h264ify-block_mp4a'] = true;
}
if (localStorage['enhanced-h264ify-disable_LN'] === undefined) {
  localStorage['enhanced-h264ify-disable_LN'] = false;
}
if (localStorage['enhanced-h264ify-max_res'] === undefined) {
  localStorage['enhanced-h264ify-max_res'] = true;
}
if (localStorage['enhanced-h264ify-res_setting'] === undefined) {
  localStorage['enhanced-h264ify-res_setting'] = "1080";
}
if (localStorage['enhanced-h264ify-battery_only'] === undefined) {
  localStorage['enhanced-h264ify-battery_only'] = false;
}

// Cache chrome.storage.local options in localStorage.
// This is needed because chrome.storage.local.get() is async and we want to
// load the injection script immediately.
// See https://bugs.chromium.org/p/chromium/issues/detail?id=54257
chrome.storage.local.get({
  // Set defaults
  block_60fps: false,
  block_h264: false,
  block_vp8: true,
  block_vp9: true,
  block_av1: true,
  block_opus: false,
  block_mp4a: false,
  disable_LN: false,
  max_res: true,
  res_setting: "1080",
  battery_only: false
 }, function(options) {
   localStorage['enhanced-h264ify-block_60fps'] = options.block_60fps;
   localStorage['enhanced-h264ify-block_h264'] = options.block_h264;
   localStorage['enhanced-h264ify-block_vp8'] = options.block_vp8;
   localStorage['enhanced-h264ify-block_vp9'] = options.block_vp9;
   localStorage['enhanced-h264ify-block_av1'] = options.block_av1;
   localStorage['enhanced-h264ify-block_opus'] = options.block_opus;
   localStorage['enhanced-h264ify-block_mp4a'] = options.block_mp4a;
   localStorage['enhanced-h264ify-disable_LN'] = options.disable_LN;
   localStorage['enhanced-h264ify-max_res'] = options.max_res;
   localStorage['enhanced-h264ify-res_setting'] = options.res_setting;
   localStorage['enhanced-h264ify-battery_only'] = options.battery_only;
   
   // Inject the codec check script with embedded settings
   // This works around Chrome 144+ restrictions on MAIN world content scripts
   injectScriptWithSettings(options);
  }
);

// Inject settings and codec check script into page context
// This is needed because Chrome 144+ restricts API access in MAIN world content scripts
async function injectScriptWithSettings(options) {
  try {
    // Fetch the script content
    const response = await fetch(chrome.runtime.getURL('/src/inject/inject_codec_check.js'));
    const scriptContent = await response.text();
    
    // Create script element
    const injectScript = document.createElement('script');
    
    // Embed settings as a global config object, then run the actual script
    const configScript = `
      window.__enhanced_h264ify_config__ = {
        block_60fps: ${options.block_60fps},
        block_h264: ${options.block_h264},
        block_vp8: ${options.block_vp8},
        block_vp9: ${options.block_vp9},
        block_av1: ${options.block_av1},
        block_opus: ${options.block_opus},
        block_mp4a: ${options.block_mp4a},
        disable_LN: ${options.disable_LN},
        max_res: ${options.max_res},
        res_setting: "${options.res_setting}",
        battery_only: ${options.battery_only}
      };
    `;
    
    injectScript.textContent = configScript + '\n' + scriptContent;
    
    injectScript.onload = function() {
      this.remove();
    };
    
    (document.head || document.documentElement).appendChild(injectScript);
  } catch (error) {
    console.error('enhanced-h264ify: Failed to inject script:', error);
  }
}

/*
document.onreadystatechange = function() {
  if (document.readyState == 'complete') {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL("/src/inject/inject_ln.js");
    document.body.appendChild(script);
  }
}
*/
