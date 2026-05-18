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

// ====== UI ELEMENTS ======
var loginOverlay = document.getElementById('login-overlay');
var loginButton = document.getElementById('login-button');
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

// Disable overscroll and bounce globally for iOS 9
document.addEventListener('touchmove', function(e) {
    e.preventDefault();
}, { passive: false });

// ====== POLYFILLS & HELPERS ======

function fetchXHR(url, options) {
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        options = options || {};
        var method = options.method || 'GET';
        xhr.open(method, url);
        
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
                        } catch(e) { rej(e); }
                    });
                }
            });
        };
        xhr.onerror = function() {
            reject(new Error("Network Error"));
        };
        xhr.send(options.body || null);
    });
}

function buildUrlQuery(params) {
    var query = [];
    for (var key in params) {
        if (params.hasOwnProperty(key)) {
            query.push(encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));
        }
    }
    return query.join("&");
}

function getQueryParam(name) {
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)");
    var results = regex.exec(window.location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

// ====== AUTHENTICATION ======

function getSha256Array(plain) {
    // using the js-sha256 library from CDN
    return sha256.array(plain);
}

function base64encode(input) {
    var str = "";
    for(var i=0; i<input.length; i++) {
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
    window.crypto.getRandomValues(values);
    var acc = "";
    for(var i=0; i<length; i++) {
        acc += possible[values[i] % possible.length];
    }
    return acc;
}

function checkAuth() {
    var code = getQueryParam('code');
    
    var scopeVersion = localStorage.getItem('auth_scope_version');
    if (scopeVersion !== '2') {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.setItem('auth_scope_version', '2');
    }
    
    accessToken = localStorage.getItem('access_token');

    if (code) {
        var codeVerifier = localStorage.getItem('code_verifier');
        var payload = {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: buildUrlQuery({
              client_id: CLIENT_ID,
              grant_type: 'authorization_code',
              code: code,
              redirect_uri: REDIRECT_URI,
              code_verifier: codeVerifier,
            })
        };

        fetchXHR("https://accounts.spotify.com/api/token", payload)
            .then(function(tokenResponse) { return tokenResponse.json(); })
            .then(function(tokenData) {
                if (tokenData && tokenData.access_token) {
                    accessToken = tokenData.access_token;
                    localStorage.setItem('access_token', accessToken);
                    if (tokenData.refresh_token) {
                        localStorage.setItem('refresh_token', tokenData.refresh_token);
                    }
                    window.history.replaceState({}, document.title, window.location.pathname);
                    loginOverlay.style.display = 'none';
                    startPolling();
                } else {
                    if (accessToken) {
                        loginOverlay.style.display = 'none';
                        startPolling();
                    } else {
                        loginOverlay.style.display = 'flex';
                    }
                }
            })
            .catch(function(e) {
                console.error("Token exchange failed", e);
                loginOverlay.style.display = 'flex';
            });
    } else {
        if (accessToken) {
            loginOverlay.style.display = 'none';
            startPolling();
        } else {
            loginOverlay.style.display = 'flex';
        }
    }
}

loginButton.addEventListener('click', function() {
    if (CLIENT_ID === 'YOUR_SPOTIFY_CLIENT_ID_HERE') {
        alert('Please edit app.js to insert your Spotify Client ID first!');
        return;
    }
    
    var codeVerifier = generateRandomString(64);
    window.localStorage.setItem('code_verifier', codeVerifier);
    
    var hashedArray = getSha256Array(codeVerifier);
    var codeChallenge = base64encode(hashedArray);

    var params =  {
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      redirect_uri: REDIRECT_URI,
    };
    
    var authUrl = "https://accounts.spotify.com/authorize?" + buildUrlQuery(params);
    window.location.href = authUrl;
});

// ====== API POLLING ======
function refreshToken() {
    var refresh_token = localStorage.getItem('refresh_token');
    if (!refresh_token) {
        localStorage.removeItem('access_token');
        window.location.reload();
        return Promise.resolve(false);
    }

    var payload = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: buildUrlQuery({
          client_id: CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: refresh_token,
        }),
    };

    return fetchXHR("https://accounts.spotify.com/api/token", payload)
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data && data.access_token) {
                accessToken = data.access_token;
                localStorage.setItem('access_token', accessToken);
                if (data.refresh_token) {
                    localStorage.setItem('refresh_token', data.refresh_token);
                }
                return true;
            } else {
                throw new Error("No access token returned");
            }
        })
        .catch(function(e) {
            console.error("Error refreshing token", e);
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            window.location.reload();
            return false;
        });
}

function startPolling() {
    fetchNowPlaying(); // fetch immediately
    setInterval(fetchNowPlaying, 5000); // then every 5 seconds
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
        if (data && data.item) {
            var isPlaying = data.is_playing;
            var trackName = data.item.name;
            var artistArr = [];
            for(var i=0; i<data.item.artists.length; i++) {
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
            
            // Prevent Spotify API propagation delay from overwriting local state mid-cycle
            if (Date.now() - lastModeChange > 4000) {
                currentShuffle = data.shuffle_state;
                currentRepeat = data.repeat_state;
            }
            fadeOutSwipeTransition();
        }
    })
    .catch(function(e) {
        console.error("Error fetching Spotify data", e);
    });
}


function updateUI(title, artist, imageUrl, isPlaying) {
    if (title === 'Nothing playing' || isPlaying === false) {
        contentContainer.style.display = 'none';
        backgroundImage.style.display = 'none';
        return; // Skip rest of updates to leave it black
    } else {
        contentContainer.style.display = '';
        backgroundImage.style.display = '';
    }

    titleText.innerText = title;
    artistText.innerText = artist;

    if (imageUrl) {
        albumArt.src = imageUrl;
        albumArt.parentElement.style.opacity = "1";
        backgroundImage.src = imageUrl;
    } else {
        albumArt.parentElement.style.opacity = "0";
        albumArt.src = '';
        backgroundImage.src = '';
    }

    // Reset animations
    setupMarquee(titleContainer, titleWrapper, titleText);
    setupMarquee(artistContainer, artistWrapper, artistText);
}

// ====== MARQUEE LOGIC ======
var activeTimeouts = {};
var activeFrames = {};

function clearMarqueeAnimations(wrapper) {
    var id = wrapper.id || "temp";
    if (activeTimeouts[id]) {
        clearTimeout(activeTimeouts[id]);
        delete activeTimeouts[id];
    }
    if (activeFrames[id]) {
        cancelAnimationFrame(activeFrames[id]);
        delete activeFrames[id];
    }
}

function setupMarquee(container, wrapper, textElement) {
    // Cancel any running animations to prevent ghost scrolling
    clearMarqueeAnimations(wrapper);

    // Remove any cloned elements completely
    while (wrapper.children.length > 1) {
        wrapper.removeChild(wrapper.lastChild);
    }

    wrapper.style.transform = 'translate3d(0px, 0, 0)';
    wrapper.style.transition = 'none';

    // Measure
    var containerWidth = container.offsetWidth;
    var textWidth = textElement.offsetWidth - 60; // Subtract the 60px padding added in CSS

    // Determine if we need to scroll
    if (textWidth > containerWidth && containerWidth > 0) {
        // Clone for seamless loop
        var clone = textElement.cloneNode(true);
        wrapper.appendChild(clone);

        // Animate using JS for precise pausing
        animateMarquee(wrapper, textElement.offsetWidth);
    } else {
        // Center text in portrait mode physically if it fits
        var isPortrait = window.matchMedia("(max-aspect-ratio: 3/4)").matches;
        if (isPortrait && containerWidth > 0) {
            var offset = (containerWidth - textWidth) / 2;
            if (offset > 0) {
                wrapper.style.transform = "translate3d(" + offset + "px, 0, 0)";
            }
        }
    }
}

function animateMarquee(wrapper, scrollWidth) {
    clearMarqueeAnimations(wrapper);
    var id = wrapper.id || "temp";

    // Constants to match WPF app
    var initialDelay = 5000;
    var pixelsPerFrame = 0.8;

    var currentX = 0;
    var lastTime = 0;

    function step(timestamp) {
        if (!lastTime) lastTime = timestamp;
        var delta = timestamp - lastTime;
        lastTime = timestamp;
        
        // Scale movement by delta time to keep speed consistent regardless of refresh rate
        var speedMultiplier = delta / 16.66;
        currentX -= (pixelsPerFrame * speedMultiplier);

        if (-currentX >= scrollWidth) {
            // Reset to beginning and pause
            currentX = 0;
            wrapper.style.transform = 'translate3d(0px, 0, 0)';
            lastTime = 0;
            activeTimeouts[id] = setTimeout(function() {
                activeFrames[id] = requestAnimationFrame(step);
            }, initialDelay);
        } else {
            wrapper.style.transform = 'translate3d(' + currentX + 'px, 0, 0)';
            activeFrames[id] = requestAnimationFrame(step);
        }
    }

    // Start with delay
    wrapper.style.transform = 'translate3d(0px, 0, 0)';
    activeTimeouts[id] = setTimeout(function() {
        activeFrames[id] = requestAnimationFrame(step);
    }, initialDelay);
}

// Handle resizing
window.addEventListener('resize', function() {
    if (titleText.innerText !== "Waiting for Spotify...") {
        setupMarquee(titleContainer, titleWrapper, titleText);
        setupMarquee(artistContainer, artistWrapper, artistText);
    }
});

// Run auth check on load
checkAuth();

// ====== INTERACTION AND PLAYBACK CONTROL ======
function fadeOutSwipeTransition() {
    if (isProcessingSwipe) {
        isProcessingSwipe = false;
        
        // FADE OUT: animate opacity only
        swipeOverlay.style.transition = 'opacity 0.3s ease-out';
        swipeOverlay.style.opacity = '0';
        
        // Reset transform invisibly after fade out is fully done (plus safety buffer)
        setTimeout(function() {
            if (swipeOverlay.style.opacity === '0') {
                swipeOverlay.style.transition = 'none';
                swipeOverlay.style.transform = 'translateX(100%)';
            }
        }, 450);
    }
}

function spotifyAction(endpoint, method) {
    if (!accessToken) return;
    method = method || 'POST';
    fetchXHR("https://api.spotify.com/v1/me/player/" + endpoint, {
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
            console.log("Action " + endpoint + " failed. Note: Spotify requires an active device and Spotify Premium for remote control.");
        }
        // Force an immediate poll to update UI visually
        setTimeout(fetchNowPlaying, 500); 
    }).catch(function(e) {
        console.error("Playback action failed", e);
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

function abortSwipe(diffX) {
    if (!isDragging && swipeOverlay.style.opacity !== '1') return;
    isDragging = false;
    isProcessingSwipe = false;
    
    // BOUNCE BACK: physically slide back to the edge it came from
    swipeOverlay.style.transition = 'transform 0.3s ease-out';
    if (diffX > 0 || (diffX === 0 && swipeOverlay.style.transform.indexOf('-') !== -1)) {
        swipeOverlay.style.transform = 'translateX(-100%)';
    } else {
        swipeOverlay.style.transform = 'translateX(100%)';
    }
    
    setTimeout(function() {
        swipeOverlay.style.opacity = '0';
        swipeOverlay.style.transition = 'none';
    }, 350);
}

document.addEventListener('touchstart', function(e) {
    if (loginOverlay.style.display !== 'none' || isProcessingSwipe) return;
    
    if (!isDragging) {
        // Initialize new gesture regardless of how many fingers landed first
        touchStartX = e.touches[0].screenX;
        touchStartY = e.touches[0].screenY;
        touchTime = Date.now();
        isDragging = true;
        touchSwipeDirection = null;
        maxTouches = e.touches.length;
        
        swipeOverlay.style.transition = 'none';
        swipeOverlay.style.opacity = '1';
    } else {
        // Update max touches if more fingers land mid-gesture
        if (e.touches.length > maxTouches) {
            maxTouches = e.touches.length;
        }
    }
});

document.addEventListener('touchmove', function(e) {
    // Disable drag logic if they are using 2 fingers
    if (!isDragging || isProcessingSwipe || maxTouches >= 2) return;
    
    var currentX = e.changedTouches[0].screenX;
    var currentY = e.changedTouches[0].screenY;
    var diffX = currentX - touchStartX;
    var diffY = currentY - touchStartY;
    
    if (!touchSwipeDirection) {
        if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
            touchSwipeDirection = Math.abs(diffX) > Math.abs(diffY) ? 'horizontal' : 'vertical';
        }
    }
    
    if (touchSwipeDirection === 'horizontal') {
        if (diffX > 0) {
            swipeOverlay.style.transform = "translateX(calc(-100% + " + diffX + "px))";
        } else {
            swipeOverlay.style.transform = "translateX(calc(100% + " + diffX + "px))";
        }
    }
});

document.addEventListener('touchend', function(e) {
    if (!isDragging) return;
    
    // Wait until ALL fingers are off the screen before processing the gesture
    if (e.touches.length > 0) return;
    
    isDragging = false;
    lastTouchEnd = Date.now();
    
    var diffX = e.changedTouches[0].screenX - touchStartX;
    var diffY = e.changedTouches[0].screenY - touchStartY;
    var time = Date.now() - touchTime;
    
    if (maxTouches >= 2) {
        // Handle multi-finger tap
        if (time < 500) {
            cyclePlaybackMode();
            swipeOverlay.style.opacity = '0';
            swipeOverlay.style.transform = 'translateX(100%)';
        } else {
            abortSwipe(0);
        }
        return;
    }
    
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
        isProcessingSwipe = true;
        swipeOverlay.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        swipeOverlay.style.transform = 'translateX(0)';
        
        if (diffX > 0) spotifyAction('previous'); 
        else spotifyAction('next');
        
        setTimeout(function() {
            if (isProcessingSwipe) fadeOutSwipeTransition();
        }, 3000);
    } else {
        if (Math.abs(diffX) > 10) {
            abortSwipe(diffX);
        } else {
            swipeOverlay.style.opacity = '0';
            swipeOverlay.style.transform = 'translateX(100%)';
            if (time < 300) togglePlayPause();
        }
    }
});

document.addEventListener('touchcancel', function(e) {
    if (!isDragging || e.touches.length > 0) return;
    
    var diffX = 0;
    if (e.changedTouches && e.changedTouches.length > 0) {
        diffX = e.changedTouches[0].screenX - touchStartX;
    }
    abortSwipe(diffX);
});

// For PC testing or generic taps not caught by touch events
document.addEventListener('click', function(e) {
    if (loginOverlay.style.display !== 'none') return;
    if (Date.now() - lastTouchEnd < 500) return; // Prevent ghost clicks from touch firing twice
    
    togglePlayPause();
});

var popupTimeout = null;
function showStatusPopup(iconHtml) {
    var popup = document.getElementById('status-popup');
    popup.innerHTML = iconHtml;
    
    if (iconHtml.indexOf('</svg><svg') !== -1) {
        popup.style.gap = '10px';
    } else {
        popup.style.gap = '0px';
    }
    
    popup.style.transition = 'none';
    popup.style.opacity = '1';
    
    if (popupTimeout) clearTimeout(popupTimeout);
    popupTimeout = setTimeout(function() {
        popup.style.transition = 'opacity 0.3s ease-out';
        popup.style.opacity = '0';
    }, 1000);
}

function cyclePlaybackMode() {
    lastModeChange = Date.now();
    var stateIdx = 0;
    
    if (!currentShuffle && currentRepeat === 'off') stateIdx = 0; // none
    else if (currentShuffle && currentRepeat === 'off') stateIdx = 1; // shuffle
    else if (currentShuffle && currentRepeat === 'context') stateIdx = 2; // shuffle and loop
    else if (!currentShuffle && currentRepeat === 'context') stateIdx = 3; // loop
    else stateIdx = 0; // fallback

    stateIdx = (stateIdx + 1) % 4;
    
    var targetShuffle = false;
    var targetRepeat = 'off';
    var iconHtml = '';

    var iconShuffle = '<svg viewBox="0 0 24 24"><path d="M10.59,9.17L5.41,4 4,5.41l5.17,5.17 1.42,-1.41zM14.5,4l2.04,2.04L4,18.59 5.41,20 17.96,7.46 20,9.5V4h-5.5zm.33,9.41l-1.41,1.41 3.13,3.13L14.5,20H20v-5.5l-2.04,2.04-3.13-3.13z"/></svg>';
    var iconLoop = '<svg viewBox="0 0 24 24"><path d="M7,7h10v3l4,-4 -4,-4v3H5v6h2V7zm10,10H7v-3l-4,4 4,4v-3h12v-6h-2v4z"/></svg>';
    var iconDash = '<svg viewBox="0 0 24 24"><path d="M4,11h16v2H4z"/></svg>';

    switch(stateIdx) {
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
        spotifyAction("shuffle?state=" + targetShuffle, 'PUT');
        currentShuffle = targetShuffle;
    }
    if (targetRepeat !== currentRepeat) {
        spotifyAction("repeat?state=" + targetRepeat, 'PUT');
        currentRepeat = targetRepeat;
    }

    showStatusPopup(iconHtml);
}
