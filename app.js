// ====== CONFIGURATION ======
var CLIENT_ID = '6e3c8d68fdf94f2ebe2b5c847b4f6772';
var REDIRECT_URI = window.location.href.split('#')[0].split('?')[0];
var SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';

var accessToken = null;
var currentTrackId = null;
var currentIsPlaying = null;
var currentShuffle = false;
var currentRepeat = 'off';
var lastModeChange = 0;

// ====== CLOCK STATE ======
var isClockMode = false;
var clockStyleIdx = parseInt(localStorage.getItem('clock_style') || '0', 10);
if (isNaN(clockStyleIdx) || clockStyleIdx < 0) clockStyleIdx = 0;
clockStyleIdx = clockStyleIdx % 2;

function isWithinNightSchedule(d) {
    var dateObj = d || new Date();
    var h = dateObj.getHours();
    return h >= 0 && h < 7;
}

var lastScheduleWindow = isWithinNightSchedule();
var isClockDimmed = lastScheduleWindow;
var clockIntervalId = null;
var analogRafId = null;
var analogGeometry = null;
var flipValues = { 'flip-hours': null, 'flip-minutes': null };
var flipTimers = { 'flip-hours': null, 'flip-minutes': null };

// ====== UI ELEMENTS ======
var loginOverlay = document.getElementById('login-overlay');
var loginButton = document.getElementById('login-button');
var importTokenInput = document.getElementById('import-token-input');
var importTokenButton = document.getElementById('import-token-button');
var backgroundContainer = document.getElementById('background-container');
var albumArtBorder = document.getElementById('album-art-border');
var albumArt = document.getElementById('album-art');
var backgroundImage = document.getElementById('background-image');
var titleText = document.getElementById('title-text');
var artistText = document.getElementById('artist-text');
var titleWrapper = document.getElementById('title-wrapper');
var artistWrapper = document.getElementById('artist-wrapper');
var titleContainer = document.getElementById('title-container');
var artistContainer = document.getElementById('artist-container');
var contentContainer = document.getElementById('content-container');
var swipeOverlay = document.getElementById('swipe-transition-overlay');
var clockContainer = document.getElementById('clock-container');
var clockFaces = [
    document.getElementById('clock-flip'),
    document.getElementById('clock-analog')
];
var analogSvg = document.getElementById('analog-svg');
var analogTicksGroup = document.getElementById('analog-ticks');
var analogHourHand = document.getElementById('analog-hour-hand');
var analogMinuteHand = document.getElementById('analog-minute-hand');
var analogSecondHand = document.getElementById('analog-second-hand');
var analogCenterDot = document.getElementById('analog-center-dot');

// ====== SAFARI 9 HELPERS ======
var raf = window.requestAnimationFrame || window.webkitRequestAnimationFrame || function(cb) {
    return setTimeout(function() { cb(Date.now()); }, 16);
};
var caf = window.cancelAnimationFrame || window.webkitCancelAnimationFrame || function(id) {
    clearTimeout(id);
};

function setTransform(el, val) {
    if (!el) return;
    el.style.webkitTransform = val;
    el.style.transform = val;
}

function setTransition(el, val) {
    if (!el) return;
    el.style.webkitTransition = val;
    el.style.transition = val;
}

function isPortraitViewport() {
    var w = document.documentElement.clientWidth || window.innerWidth || 1024;
    var h = document.documentElement.clientHeight || window.innerHeight || 768;
    return h > w;
}

function pad2(num) {
    return (num < 10 ? '0' : '') + num;
}

// Disable rubber-band overscroll on iOS 9 without blocking login/import form interaction
document.addEventListener('touchmove', function(e) {
    if (loginOverlay.style.display === 'none') {
        e.preventDefault();
    }
}, false);

// ====== LAYOUT SIZING FOR iOS 9 (Replaces CSS min(), vmax, and flex+translateY) ======
function updateResponsiveLayout() {
    var w = document.documentElement.clientWidth || window.innerWidth || 1024;
    var h = document.documentElement.clientHeight || window.innerHeight || 768;

    // Size rotating background container cleanly to cover diagonal without 150vmax bugs
    if (backgroundContainer) {
        var diag = Math.ceil(Math.sqrt(w * w + h * h)) + 60;
        backgroundContainer.style.width = diag + 'px';
        backgroundContainer.style.height = diag + 'px';
    }

    // Size portrait album art square without CSS min()
    if (albumArtBorder) {
        if (isPortraitViewport()) {
            var maxSide = Math.max(140, Math.min(w - 60, h - 220));
            albumArtBorder.style.width = maxSide + 'px';
            albumArtBorder.style.height = maxSide + 'px';
        } else {
            albumArtBorder.style.width = '';
            albumArtBorder.style.height = '';
        }
    }

    // Size flip clock typography and line-height to exact card dimensions
    sizeFlipClock();
}

function sizeFlipClock() {
    var units = [
        document.getElementById('flip-hours'),
        document.getElementById('flip-minutes')
    ];
    for (var i = 0; i < units.length; i++) {
        var unit = units[i];
        if (!unit) continue;
        var uw = unit.offsetWidth;
        var uh = unit.offsetHeight;
        if (uw <= 0 || uh <= 0) continue;

        // Guarantee 2 digits ("12", "00") fit comfortably inside both 4:3 iPad and 16:9 screens
        var fontSize = Math.floor(Math.min(uw * 0.70, uh * 0.76));
        unit.style.fontSize = fontSize + 'px';

        var spans = unit.getElementsByTagName('span');
        for (var j = 0; j < spans.length; j++) {
            spans[j].style.lineHeight = uh + 'px';
        }
    }
}

// ====== PURE ES5 SHA-256 (No external CDN or crypto.subtle dependency) ======
function sha256Bytes(ascii) {
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }

    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var i, j;
    var words = [];
    var asciiBitLength = ascii.length * 8;

    var hash = [];
    var k = [];
    var primeCounter = 0;
    var isComposite = {};

    for (var candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (i = 0; i < 313; i += candidate) {
                isComposite[i] = candidate;
            }
            hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        }
    }

    ascii += '\x80';
    while ((ascii.length % 64) - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) {
        j = ascii.charCodeAt(i);
        words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength | 0);

    for (j = 0; j < words.length;) {
        var w = words.slice(j, j += 16);
        var oldHash = hash.slice(0);
        hash = hash.slice(0, 8);

        for (i = 0; i < 64; i++) {
            var w15 = w[i - 15], w2 = w[i - 2];
            var a = hash[0], e = hash[4];
            var temp1 = hash[7]
                + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                + ((e & hash[5]) ^ ((~e) & hash[6]))
                + k[i]
                + (w[i] = (i < 16) ? w[i] : (
                    w[i - 16]
                    + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                    + w[i - 7]
                    + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                ) | 0);
            var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

            hash = [(temp1 + temp2) | 0].concat(hash);
            hash[4] = (hash[4] + temp1) | 0;
        }

        for (i = 0; i < 8; i++) {
            hash[i] = (hash[i] + oldHash[i]) | 0;
        }
    }

    var out = [];
    for (i = 0; i < 8; i++) {
        for (j = 3; j >= 0; j--) {
            out.push((hash[i] >> (j * 8)) & 255);
        }
    }
    return out;
}

// ====== NETWORK & URL HELPERS (ES5 / Safari 9) ======
function fetchXHR(url, options) {
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        options = options || {};
        var method = options.method || 'GET';
        xhr.open(method, url, true);

        if (options.headers) {
            for (var key in options.headers) {
                if (options.headers.hasOwnProperty(key)) {
                    xhr.setRequestHeader(key, options.headers[key]);
                }
            }
        }

        xhr.onload = function() {
            resolve({
                status: xhr.status,
                json: function() {
                    return new Promise(function(res, rej) {
                        try {
                            if (!xhr.responseText) {
                                res(null);
                            } else {
                                res(JSON.parse(xhr.responseText));
                            }
                        } catch (e) {
                            rej(e);
                        }
                    });
                }
            });
        };
        xhr.onerror = function() {
            reject(new Error('Network Error'));
        };
        xhr.send(options.body || null);
    });
}

function buildUrlQuery(params) {
    var query = [];
    for (var key in params) {
        if (params.hasOwnProperty(key)) {
            query.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
        }
    }
    return query.join('&');
}

function getQueryParam(name, searchStr) {
    var src = typeof searchStr === 'string' ? searchStr : window.location.search;
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(src);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

function base64encode(input) {
    var str = '';
    for (var i = 0; i < input.length; i++) {
        str += String.fromCharCode(input[i]);
    }
    return btoa(str)
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function generateRandomString(length) {
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var values = new Uint8Array(length);
    if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(values);
    } else {
        for (var j = 0; j < length; j++) {
            values[j] = Math.floor(Math.random() * 256);
        }
    }
    var acc = '';
    for (var i = 0; i < length; i++) {
        acc += possible[values[i] % possible.length];
    }
    return acc;
}

// ====== AUTHENTICATION ======
function showLoginOverlay() {
    loginOverlay.style.display = '-webkit-flex';
    loginOverlay.style.display = 'flex';
}

function hideLoginOverlay() {
    loginOverlay.style.display = 'none';
}

function extractRefreshToken(rawInput) {
    var trimmed = (rawInput || '').replace(/^\s+|\s+$/g, '');
    if (!trimmed) return '';
    if (trimmed.indexOf('import_token=') !== -1) {
        var qIdx = trimmed.indexOf('?');
        var searchPart = qIdx !== -1 ? trimmed.slice(qIdx) : '?' + trimmed;
        return getQueryParam('import_token', searchPart);
    }
    return trimmed;
}

function importAndExchangeToken(tokenStr) {
    var cleanToken = extractRefreshToken(tokenStr);
    if (!cleanToken) {
        alert('Please paste a valid import link or refresh token.');
        return;
    }
    localStorage.setItem('auth_scope_version', '2');
    localStorage.setItem('refresh_token', cleanToken);
    localStorage.removeItem('access_token');
    showLoginOverlay();
    refreshToken().then(function(success) {
        if (success) {
            hideLoginOverlay();
            startPolling();
        } else {
            alert('Import failed. Token may be invalid or expired.');
        }
    });
}

function checkAuth() {
    var code = getQueryParam('code');
    var importToken = getQueryParam('import_token');
    var exportMode = getQueryParam('export');

    // Run scope version migration BEFORE handling import_token so new tokens are not wiped
    var scopeVersion = localStorage.getItem('auth_scope_version');
    if (scopeVersion !== '2') {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.setItem('auth_scope_version', '2');
    }

    if (exportMode === 'true') {
        localStorage.setItem('export_mode', 'true');
    }

    if (importToken) {
        localStorage.setItem('refresh_token', importToken);
        localStorage.removeItem('access_token');
        if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    accessToken = localStorage.getItem('access_token');

    if (importToken && !code) {
        showLoginOverlay();
        refreshToken().then(function(success) {
            if (success) {
                hideLoginOverlay();
                startPolling();
            } else {
                alert('Import failed. Token may be invalid or expired.');
            }
        });
        return;
    }

    if (code) {
        var codeVerifier = localStorage.getItem('code_verifier');
        var payload = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: buildUrlQuery({
                client_id: CLIENT_ID,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
                code_verifier: codeVerifier
            })
        };

        fetchXHR('https://accounts.spotify.com/api/token', payload)
            .then(function(tokenResponse) { return tokenResponse.json(); })
            .then(function(tokenData) {
                if (tokenData && tokenData.access_token) {
                    accessToken = tokenData.access_token;
                    localStorage.setItem('access_token', accessToken);
                    if (tokenData.refresh_token) {
                        localStorage.setItem('refresh_token', tokenData.refresh_token);
                    }
                    if (window.history && window.history.replaceState) {
                        window.history.replaceState({}, document.title, window.location.pathname);
                    }
                    if (localStorage.getItem('export_mode') === 'true') {
                        showExportScreen();
                        return;
                    }
                    hideLoginOverlay();
                    startPolling();
                } else if (accessToken) {
                    if (localStorage.getItem('export_mode') === 'true') {
                        showExportScreen();
                        return;
                    }
                    hideLoginOverlay();
                    startPolling();
                } else {
                    showLoginOverlay();
                }
            })
            .catch(function(e) {
                console.error('Token exchange failed', e);
                showLoginOverlay();
            });
    } else if (accessToken) {
        if (localStorage.getItem('export_mode') === 'true') {
            showExportScreen();
            return;
        }
        hideLoginOverlay();
        startPolling();
    } else {
        showLoginOverlay();
    }
}

function showExportScreen() {
    showLoginOverlay();
    var rToken = localStorage.getItem('refresh_token') || '';
    var link = window.location.href.split('?')[0].split('#')[0] + '?import_token=' + encodeURIComponent(rToken);
    loginOverlay.innerHTML =
        '<h2>Export Login</h2>' +
        '<p style="margin:16px 0; max-width:500px; color:#ccc;">Open this link on your iPad (or copy and paste it into the Home Screen app):</p>' +
        '<textarea style="width:90%; max-width:500px; height:96px; margin-bottom:18px; color:#000; padding:10px; border-radius:8px; font-family:monospace;" readonly>' + link + '</textarea>' +
        '<a href="mailto:?subject=iPad%20Login%20Link&body=' + encodeURIComponent(link) + '" style="background:#1DB954; color:#fff; padding:14px 28px; border-radius:30px; text-decoration:none; font-weight:bold; font-size:17px;">Email Link to iPad</a>' +
        '<button type="button" onclick="localStorage.removeItem(\'export_mode\'); window.location.reload();" style="margin-top:20px; background:none; border:none; color:#aaa; text-decoration:underline; font-size:15px; cursor:pointer;">Return to normal mode</button>';
}

if (loginButton) {
    loginButton.addEventListener('click', function() {
        if (CLIENT_ID === 'YOUR_SPOTIFY_CLIENT_ID_HERE') {
            alert('Please edit app.js to insert your Spotify Client ID first!');
            return;
        }
        var codeVerifier = generateRandomString(64);
        window.localStorage.setItem('code_verifier', codeVerifier);

        var hashedArray = sha256Bytes(codeVerifier);
        var codeChallenge = base64encode(hashedArray);

        var params = {
            response_type: 'code',
            client_id: CLIENT_ID,
            scope: SCOPES,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
            redirect_uri: REDIRECT_URI
        };

        window.location.href = 'https://accounts.spotify.com/authorize?' + buildUrlQuery(params);
    });
}

if (importTokenButton && importTokenInput) {
    importTokenButton.addEventListener('click', function() {
        importAndExchangeToken(importTokenInput.value);
    });
}

// ====== API POLLING ======
var pollingStarted = false;

function refreshToken() {
    var refresh_token = localStorage.getItem('refresh_token');
    if (!refresh_token) {
        localStorage.removeItem('access_token');
        showLoginOverlay();
        return Promise.resolve(false);
    }

    var payload = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: buildUrlQuery({
            client_id: CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: refresh_token
        })
    };

    return fetchXHR('https://accounts.spotify.com/api/token', payload)
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data && data.access_token) {
                accessToken = data.access_token;
                localStorage.setItem('access_token', accessToken);
                if (data.refresh_token) {
                    localStorage.setItem('refresh_token', data.refresh_token);
                }
                return true;
            }
            throw new Error('No access token returned');
        })
        .catch(function(e) {
            console.error('Error refreshing token', e);
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            showLoginOverlay();
            return false;
        });
}

function startPolling() {
    if (pollingStarted) return;
    pollingStarted = true;
    setClockMode(true);
    fetchNowPlaying();
    setInterval(fetchNowPlaying, 5000);
}

function fetchNowPlaying() {
    if (!accessToken) return;

    fetchXHR('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { 'Authorization': 'Bearer ' + accessToken }
    })
    .then(function(response) {
        if (response.status === 204) {
            if (currentTrackId !== 'none' || currentIsPlaying !== false) {
                currentTrackId = 'none';
                currentIsPlaying = false;
                updateUI('Nothing playing', '', null, false);
            }
            return null;
        }

        if (response.status === 401) {
            return refreshToken().then(function(refreshed) {
                if (refreshed) {
                    fetchNowPlaying();
                }
                return null;
            });
        }

        return response.json();
    })
    .then(function(data) {
        if (data === null || typeof data === 'undefined') return;

        if (data && data.item) {
            var isPlaying = data.is_playing;
            var trackName = data.item.name;
            var artistArr = [];
            for (var i = 0; i < data.item.artists.length; i++) {
                artistArr.push(data.item.artists[i].name);
            }
            var artistName = artistArr.join(', ');
            var imageUrl = null;
            if (data.item.album && data.item.album.images && data.item.album.images.length > 0) {
                imageUrl = data.item.album.images[0].url;
            }

            if (data.item.id !== currentTrackId || isPlaying !== currentIsPlaying) {
                currentTrackId = data.item.id;
                currentIsPlaying = isPlaying;
                updateUI(trackName, artistName, imageUrl, isPlaying);
            }

            if (Date.now() - lastModeChange > 4000) {
                currentShuffle = data.shuffle_state;
                currentRepeat = data.repeat_state;
            }
            if (!isClockMode) {
                fadeOutSwipeTransition();
            }
        } else {
            if (currentTrackId !== 'none' || currentIsPlaying !== false) {
                currentTrackId = 'none';
                currentIsPlaying = false;
                updateUI('Nothing playing', '', null, false);
            }
        }
    })
    .catch(function(e) {
        console.error('Error fetching Spotify data', e);
    });
}

function updateUI(title, artist, imageUrl, isPlaying) {
    if (title === 'Nothing playing' || isPlaying === false) {
        setClockMode(true);
        return;
    } else {
        setClockMode(false);
    }

    titleText.innerText = title;
    artistText.innerText = artist;

    if (imageUrl) {
        albumArt.src = imageUrl;
        albumArt.parentElement.style.opacity = '1';
        backgroundImage.src = imageUrl;
    } else {
        albumArt.parentElement.style.opacity = '0';
        albumArt.src = '';
        backgroundImage.src = '';
    }

    updateResponsiveLayout();
    setupMarquee(titleContainer, titleWrapper, titleText);
    setupMarquee(artistContainer, artistWrapper, artistText);
}

// ====== MARQUEE LOGIC ======
var activeTimeouts = {};
var activeFrames = {};

function clearMarqueeAnimations(wrapper) {
    var id = wrapper.id || 'temp';
    if (activeTimeouts[id]) {
        clearTimeout(activeTimeouts[id]);
        delete activeTimeouts[id];
    }
    if (activeFrames[id]) {
        caf(activeFrames[id]);
        delete activeFrames[id];
    }
}

function setupMarquee(container, wrapper, textElement) {
    clearMarqueeAnimations(wrapper);

    while (wrapper.children.length > 1) {
        wrapper.removeChild(wrapper.lastChild);
    }

    setTransform(wrapper, 'translate3d(0px, 0, 0)');
    setTransition(wrapper, 'none');

    var containerWidth = container.offsetWidth;
    var textWidth = textElement.offsetWidth - 60;

    if (textWidth > containerWidth && containerWidth > 0) {
        var clone = textElement.cloneNode(true);
        wrapper.appendChild(clone);
        animateMarquee(wrapper, textElement.offsetWidth);
    } else {
        if (isPortraitViewport() && containerWidth > 0) {
            var offset = (containerWidth - textWidth) / 2;
            if (offset > 0) {
                setTransform(wrapper, 'translate3d(' + offset + 'px, 0, 0)');
            }
        }
    }
}

function animateMarquee(wrapper, scrollWidth) {
    clearMarqueeAnimations(wrapper);
    var id = wrapper.id || 'temp';

    var initialDelay = 5000;
    var pixelsPerFrame = 0.8;
    var currentX = 0;
    var lastTime = 0;

    function step(timestamp) {
        if (!lastTime) lastTime = timestamp;
        var delta = timestamp - lastTime;
        lastTime = timestamp;

        var speedMultiplier = delta / 16.66;
        currentX -= (pixelsPerFrame * speedMultiplier);

        if (-currentX >= scrollWidth) {
            currentX = 0;
            setTransform(wrapper, 'translate3d(0px, 0, 0)');
            lastTime = 0;
            activeTimeouts[id] = setTimeout(function() {
                activeFrames[id] = raf(step);
            }, initialDelay);
        } else {
            setTransform(wrapper, 'translate3d(' + currentX + 'px, 0, 0)');
            activeFrames[id] = raf(step);
        }
    }

    setTransform(wrapper, 'translate3d(0px, 0, 0)');
    activeTimeouts[id] = setTimeout(function() {
        activeFrames[id] = raf(step);
    }, initialDelay);
}

// Handle resizing & iOS orientation changes
function handleViewportResize() {
    updateResponsiveLayout();
    if (!isClockMode && titleText.innerText !== 'Waiting for Spotify...') {
        setupMarquee(titleContainer, titleWrapper, titleText);
        setupMarquee(artistContainer, artistWrapper, artistText);
    }
    buildAnalogTicks();
    if (isClockMode && clockStyleIdx === 1) {
        renderAnalogHands();
    }
}

window.addEventListener('resize', handleViewportResize);
window.addEventListener('orientationchange', function() {
    setTimeout(handleViewportResize, 150);
});

// ====== CLOCK LOGIC ======
function applyClockDimState() {
    if (!clockContainer) return;
    if (isClockDimmed) {
        clockContainer.classList.add('clock-dim-red');
    } else {
        clockContainer.classList.remove('clock-dim-red');
    }
}

function toggleClockDim() {
    isClockDimmed = !isClockDimmed;
    applyClockDimState();
}

function applyClockStyle() {
    for (var i = 0; i < clockFaces.length; i++) {
        var face = clockFaces[i];
        if (!face) continue;
        if (i === clockStyleIdx) {
            face.classList.add('active');
        } else {
            face.classList.remove('active');
        }
    }

    if (isClockMode && clockStyleIdx === 0) {
        sizeFlipClock();
        updateClock(false);
    }

    if (isClockMode && clockStyleIdx === 1) {
        buildAnalogTicks();
        startAnalogAnimation();
    } else {
        stopAnalogAnimation();
    }
}

function setClockMode(enabled) {
    isClockMode = enabled;
    if (enabled) {
        contentContainer.style.display = 'none';
        backgroundContainer.style.display = 'none';
        clockContainer.style.display = '-webkit-flex';
        clockContainer.style.display = 'flex';
        applyClockDimState();
        applyClockStyle();
        sizeFlipClock();
        updateClock(false);
    } else {
        clockContainer.style.display = 'none';
        stopAnalogAnimation();
        contentContainer.style.display = '';
        backgroundContainer.style.display = '';
        updateResponsiveLayout();
    }
}

function updateFlipUnit(unitId, newVal, animate) {
    var unit = document.getElementById(unitId);
    if (!unit) return;
    var cardTop = unit.querySelector('.flip-card-top span');
    var cardBottom = unit.querySelector('.flip-card-bottom span');
    var leafTop = unit.querySelector('.flip-leaf-top span');
    var leafBottom = unit.querySelector('.flip-leaf-bottom span');

    var prevVal = flipValues[unitId];
    if (prevVal === newVal) return;
    flipValues[unitId] = newVal;

    if (flipTimers[unitId]) {
        clearTimeout(flipTimers[unitId]);
        flipTimers[unitId] = null;
    }

    if (!animate || prevVal === null) {
        unit.classList.remove('flipping');
        cardTop.textContent = newVal;
        cardBottom.textContent = newVal;
        leafTop.textContent = newVal;
        leafBottom.textContent = newVal;
        return;
    }

    unit.classList.remove('flipping');
    cardTop.textContent = newVal;
    leafTop.textContent = prevVal;
    cardBottom.textContent = prevVal;
    leafBottom.textContent = newVal;

    void unit.offsetWidth;
    unit.classList.add('flipping');

    flipTimers[unitId] = setTimeout(function() {
        cardBottom.textContent = newVal;
        leafTop.textContent = newVal;
        unit.classList.remove('flipping');
        flipTimers[unitId] = null;
    }, 520);
}

function updateClock(animate) {
    var shouldAnimate = (typeof animate === 'undefined') ? true : animate;
    var now = new Date();
    var currentWindow = isWithinNightSchedule(now);
    if (currentWindow !== lastScheduleWindow) {
        lastScheduleWindow = currentWindow;
        isClockDimmed = currentWindow;
        applyClockDimState();
    }

    var hours12 = (now.getHours() % 12) || 12;
    var hoursStr = String(hours12);
    var minutesStr = pad2(now.getMinutes());

    var doFlip = shouldAnimate && isClockMode && clockStyleIdx === 0;
    updateFlipUnit('flip-hours', hoursStr, doFlip);
    updateFlipUnit('flip-minutes', minutesStr, doFlip);
}

function buildAnalogTicks() {
    if (!analogSvg || !analogTicksGroup) return;
    var W = document.documentElement.clientWidth || window.innerWidth || 1024;
    var H = document.documentElement.clientHeight || window.innerHeight || 768;
    analogSvg.setAttribute('width', String(W));
    analogSvg.setAttribute('height', String(H));
    analogSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    var cx = W / 2;
    var cy = H / 2;
    var padding = 20;
    var rx = Math.max(40, W / 2 - padding);
    var ry = Math.max(40, H / 2 - padding);
    var cr = Math.min(rx, ry) * 0.22;
    var ix = rx - cr;
    var iy = ry - cr;

    var minRadius = Math.max(30, Math.min(rx, ry) - 50);
    analogGeometry = { cx: cx, cy: cy, minRadius: minRadius };

    var hourWidth = Math.max(11, Math.round(minRadius * 0.068));
    var minuteWidth = Math.max(7, Math.round(minRadius * 0.04));
    analogHourHand.setAttribute('stroke-width', String(hourWidth));
    analogMinuteHand.setAttribute('stroke-width', String(minuteWidth));
    analogSecondHand.setAttribute('stroke-width', '3.5');
    analogCenterDot.setAttribute('cx', String(cx));
    analogCenterDot.setAttribute('cy', String(cy));
    analogCenterDot.setAttribute('r', String(Math.max(8, Math.round(minRadius * 0.048))));

    var svgNS = 'http://www.w3.org/2000/svg';
    while (analogTicksGroup.firstChild) {
        analogTicksGroup.removeChild(analogTicksGroup.firstChild);
    }

    for (var i = 0; i < 60; i++) {
        var theta = (i * 6) * Math.PI / 180;
        var dx = Math.sin(theta);
        var dy = -Math.cos(theta);
        var ax = Math.abs(dx);
        var ay = Math.abs(dy);

        var t = 0;
        var hitEdge = false;

        if (ax > 1e-6) {
            var tv = rx / ax;
            if (tv * ay <= iy + 1e-6) {
                t = tv;
                hitEdge = true;
            }
        }
        if (!hitEdge && ay > 1e-6) {
            var th = ry / ay;
            if (th * ax <= ix + 1e-6) {
                t = th;
                hitEdge = true;
            }
        }
        if (!hitEdge) {
            var b = ax * ix + ay * iy;
            var c = ix * ix + iy * iy - cr * cr;
            t = b + Math.sqrt(Math.max(0, b * b - c));
        }

        var isMajor = (i % 5 === 0);
        var tickLen = isMajor ? 44 : 24;
        var x1 = cx + t * dx;
        var y1 = cy + t * dy;
        var x2 = cx + (t - tickLen) * dx;
        var y2 = cy + (t - tickLen) * dy;

        var line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', x1.toFixed(2));
        line.setAttribute('y1', y1.toFixed(2));
        line.setAttribute('x2', x2.toFixed(2));
        line.setAttribute('y2', y2.toFixed(2));
        line.setAttribute('stroke-width', isMajor ? '8' : '3.5');
        line.setAttribute('class', isMajor ? 'analog-tick analog-tick-major' : 'analog-tick analog-tick-minor');
        analogTicksGroup.appendChild(line);
    }
}

function setHandCoords(lineEl, cx, cy, angleRad, startOffset, endOffset) {
    var dx = Math.sin(angleRad);
    var dy = -Math.cos(angleRad);
    lineEl.setAttribute('x1', (cx + startOffset * dx).toFixed(2));
    lineEl.setAttribute('y1', (cy + startOffset * dy).toFixed(2));
    lineEl.setAttribute('x2', (cx + endOffset * dx).toFixed(2));
    lineEl.setAttribute('y2', (cy + endOffset * dy).toFixed(2));
}

function renderAnalogHands() {
    if (!analogGeometry) buildAnalogTicks();
    if (!analogGeometry) return;

    var cx = analogGeometry.cx;
    var cy = analogGeometry.cy;
    var minRadius = analogGeometry.minRadius;

    var now = new Date();
    var ms = now.getMilliseconds();
    var sec = now.getSeconds() + ms / 1000;
    var min = now.getMinutes() + sec / 60;
    var hr = (now.getHours() % 12) + min / 60;

    var hrAngle = (hr * 30) * Math.PI / 180;
    var minAngle = (min * 6) * Math.PI / 180;
    var secAngle = (sec * 6) * Math.PI / 180;

    setHandCoords(analogHourHand, cx, cy, hrAngle, 0, minRadius * 0.56);
    setHandCoords(analogMinuteHand, cx, cy, minAngle, 0, minRadius * 0.88);
    setHandCoords(analogSecondHand, cx, cy, secAngle, -minRadius * 0.18, minRadius * 0.94);
}

function startAnalogAnimation() {
    if (analogRafId !== null) return;
    function frame() {
        if (!isClockMode || clockStyleIdx !== 1) {
            analogRafId = null;
            return;
        }
        renderAnalogHands();
        analogRafId = raf(frame);
    }
    renderAnalogHands();
    analogRafId = raf(frame);
}

function stopAnalogAnimation() {
    if (analogRafId !== null) {
        caf(analogRafId);
        analogRafId = null;
    }
}

function resumeSpotifyFromClock() {
    spotifyAction('play', 'PUT');
    if (currentTrackId && currentTrackId !== 'none' && titleText.innerText !== 'Waiting for Spotify...') {
        currentIsPlaying = true;
        updateUI(titleText.innerText, artistText.innerText, backgroundImage.src, true);
    }
}

function initClock() {
    updateResponsiveLayout();
    buildAnalogTicks();
    applyClockDimState();
    applyClockStyle();
    updateClock(false);
    if (!clockIntervalId) {
        clockIntervalId = setInterval(function() { updateClock(true); }, 1000);
    }
}

// ====== INTERACTION AND PLAYBACK CONTROL ======
function fadeOutSwipeTransition() {
    if (isProcessingSwipe) {
        isProcessingSwipe = false;

        setTransition(swipeOverlay, 'opacity 0.3s ease-out');
        swipeOverlay.style.opacity = '0';

        setTimeout(function() {
            if (swipeOverlay.style.opacity === '0') {
                setTransition(swipeOverlay, 'none');
                setTransform(swipeOverlay, 'translate3d(100%, 0, 0)');
            }
        }, 450);
    }
}

function spotifyAction(endpoint, method) {
    if (!accessToken) return;
    method = method || 'POST';
    fetchXHR('https://api.spotify.com/v1/me/player/' + endpoint, {
        method: method,
        headers: { 'Authorization': 'Bearer ' + accessToken }
    }).then(function(response) {
        if (response.status === 401) {
            refreshToken().then(function(refreshed) {
                if (refreshed) spotifyAction(endpoint, method);
            });
            return;
        }
        if (response.status === 403 || response.status === 404) {
            console.log('Action ' + endpoint + ' failed. Active Spotify device & Premium required.');
        }
        setTimeout(fetchNowPlaying, 500);
    }).catch(function(e) {
        console.error('Playback action failed', e);
    });
}

function togglePlayPause() {
    if (currentIsPlaying === null) return;
    if (currentIsPlaying) {
        spotifyAction('pause', 'PUT');
        currentIsPlaying = false;
        updateUI(titleText.innerText, artistText.innerText, backgroundImage.src, false);
    } else {
        spotifyAction('play', 'PUT');
        currentIsPlaying = true;
        updateUI(titleText.innerText, artistText.innerText, backgroundImage.src, true);
    }
}

var touchStartX = 0;
var touchStartY = 0;
var touchTime = 0;
var lastTouchEnd = 0;
var isDragging = false;
var isProcessingSwipe = false;
var touchSwipeDirection = null;
var maxTouches = 0;
var lastSwipeSign = 1;

function abortSwipe(diffX) {
    if (!isDragging && swipeOverlay.style.opacity !== '1') return;
    isDragging = false;
    isProcessingSwipe = false;

    setTransition(swipeOverlay, '-webkit-transform 0.3s ease-out, transform 0.3s ease-out');
    if (diffX > 0 || (diffX === 0 && lastSwipeSign < 0)) {
        setTransform(swipeOverlay, 'translate3d(-100%, 0, 0)');
    } else {
        setTransform(swipeOverlay, 'translate3d(100%, 0, 0)');
    }

    setTimeout(function() {
        swipeOverlay.style.opacity = '0';
        setTransition(swipeOverlay, 'none');
    }, 350);
}

document.addEventListener('touchstart', function(e) {
    if (loginOverlay.style.display !== 'none' || isProcessingSwipe) return;

    if (!isDragging) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchTime = Date.now();
        isDragging = true;
        touchSwipeDirection = null;
        maxTouches = e.touches.length;

        setTransition(swipeOverlay, 'none');
        setTransform(swipeOverlay, 'translate3d(100%, 0, 0)');
        swipeOverlay.style.opacity = '1';
    } else {
        if (e.touches.length > maxTouches) {
            maxTouches = e.touches.length;
        }
    }
}, false);

document.addEventListener('touchmove', function(e) {
    if (!isDragging || isProcessingSwipe || maxTouches >= 2) return;

    var currentX = e.changedTouches[0].clientX;
    var currentY = e.changedTouches[0].clientY;
    var diffX = currentX - touchStartX;
    var diffY = currentY - touchStartY;

    if (!touchSwipeDirection) {
        if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
            touchSwipeDirection = Math.abs(diffX) > Math.abs(diffY) ? 'horizontal' : 'vertical';
        }
    }

    if (touchSwipeDirection === 'horizontal') {
        var vw = document.documentElement.clientWidth || window.innerWidth || 1024;
        if (diffX > 0) {
            lastSwipeSign = -1;
            setTransform(swipeOverlay, 'translate3d(' + (-vw + diffX) + 'px, 0, 0)');
        } else {
            lastSwipeSign = 1;
            setTransform(swipeOverlay, 'translate3d(' + (vw + diffX) + 'px, 0, 0)');
        }
    }
}, false);

document.addEventListener('touchend', function(e) {
    if (!isDragging) return;
    if (e.touches.length > 0) return;

    isDragging = false;
    lastTouchEnd = Date.now();

    var diffX = e.changedTouches[0].clientX - touchStartX;
    var diffY = e.changedTouches[0].clientY - touchStartY;
    var time = Date.now() - touchTime;

    if (maxTouches >= 2) {
        if (time < 500) {
            if (isClockMode) {
                toggleClockDim();
            } else {
                cyclePlaybackMode();
            }
            swipeOverlay.style.opacity = '0';
            setTransform(swipeOverlay, 'translate3d(100%, 0, 0)');
        } else {
            abortSwipe(0);
        }
        return;
    }

    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
        isProcessingSwipe = true;
        setTransition(swipeOverlay, '-webkit-transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)');
        setTransform(swipeOverlay, 'translate3d(0, 0, 0)');

        if (isClockMode) {
            setTimeout(function() {
                clockStyleIdx = (clockStyleIdx + 1) % 2;
                localStorage.setItem('clock_style', String(clockStyleIdx));
                applyClockStyle();
                fadeOutSwipeTransition();
            }, 300);
        } else {
            if (diffX > 0) spotifyAction('previous');
            else spotifyAction('next');

            setTimeout(function() {
                if (isProcessingSwipe) fadeOutSwipeTransition();
            }, 3000);
        }
    } else {
        if (Math.abs(diffX) > 10) {
            abortSwipe(diffX);
        } else {
            swipeOverlay.style.opacity = '0';
            setTransform(swipeOverlay, 'translate3d(100%, 0, 0)');
            if (time < 300) {
                if (isClockMode) {
                    resumeSpotifyFromClock();
                } else {
                    togglePlayPause();
                }
            }
        }
    }
}, false);

document.addEventListener('touchcancel', function(e) {
    if (!isDragging || e.touches.length > 0) return;

    var diffX = 0;
    if (e.changedTouches && e.changedTouches.length > 0) {
        diffX = e.changedTouches[0].clientX - touchStartX;
    }
    abortSwipe(diffX);
}, false);

// Desktop click fallback
document.addEventListener('click', function(e) {
    if (loginOverlay.style.display !== 'none') return;
    if (Date.now() - lastTouchEnd < 500) return;

    if (isClockMode) {
        resumeSpotifyFromClock();
    } else {
        togglePlayPause();
    }
}, false);

var popupTimeout = null;
function showStatusPopup(iconHtml) {
    var popup = document.getElementById('status-popup');
    popup.innerHTML = iconHtml;

    setTransition(popup, 'none');
    popup.style.opacity = '1';

    if (popupTimeout) clearTimeout(popupTimeout);
    popupTimeout = setTimeout(function() {
        setTransition(popup, 'opacity 0.3s ease-out');
        popup.style.opacity = '0';
    }, 1000);
}

function cyclePlaybackMode() {
    lastModeChange = Date.now();
    var stateIdx = 0;

    if (!currentShuffle && currentRepeat === 'off') stateIdx = 0;
    else if (currentShuffle && currentRepeat === 'off') stateIdx = 1;
    else if (currentShuffle && currentRepeat === 'context') stateIdx = 2;
    else if (!currentShuffle && currentRepeat === 'context') stateIdx = 3;
    else stateIdx = 0;

    stateIdx = (stateIdx + 1) % 4;

    var targetShuffle = false;
    var targetRepeat = 'off';
    var iconHtml = '';

    var iconShuffle = '<svg viewBox="0 0 24 24"><path d="M10.59,9.17L5.41,4 4,5.41l5.17,5.17 1.42,-1.41zM14.5,4l2.04,2.04L4,18.59 5.41,20 17.96,7.46 20,9.5V4h-5.5zm.33,9.41l-1.41,1.41 3.13,3.13L14.5,20H20v-5.5l-2.04,2.04-3.13-3.13z"/></svg>';
    var iconLoop = '<svg viewBox="0 0 24 24"><path d="M7,7h10v3l4,-4 -4,-4v3H5v6h2V7zm10,10H7v-3l-4,4 4,4v-3h12v-6h-2v4z"/></svg>';
    var iconDash = '<svg viewBox="0 0 24 24"><path d="M4,11h16v2H4z"/></svg>';

    switch (stateIdx) {
        case 0:
            targetShuffle = false; targetRepeat = 'off';
            iconHtml = iconDash;
            break;
        case 1:
            targetShuffle = true; targetRepeat = 'off';
            iconHtml = iconShuffle;
            break;
        case 2:
            targetShuffle = true; targetRepeat = 'context';
            iconHtml = iconShuffle + iconLoop;
            break;
        case 3:
            targetShuffle = false; targetRepeat = 'context';
            iconHtml = iconLoop;
            break;
    }

    if (targetShuffle !== currentShuffle) {
        spotifyAction('shuffle?state=' + targetShuffle, 'PUT');
        currentShuffle = targetShuffle;
    }
    if (targetRepeat !== currentRepeat) {
        spotifyAction('repeat?state=' + targetRepeat, 'PUT');
        currentRepeat = targetRepeat;
    }

    showStatusPopup(iconHtml);
}

// ====== BOOTSTRAP ======
initClock();
checkAuth();