// ==UserScript==
// @name        Last.fm Bulk Edit (caldwellmatthew fork)
// @namespace   https://github.com/caldwellmatthew/lastfm-bulk-edit
// @version     0.3.4
// @author      Rudey, caldwellmatthew
// @description Bulk edit your scrobbles for any artist or album on Last.fm at once.
// @license     GPL-3.0-or-later
// @homepageURL https://github.com/caldwellmatthew/lastfm-bulk-edit
// @icon        https://www.last.fm/static/images/lastfm_avatar_twitter.png
// @updateURL   https://raw.githubusercontent.com/caldwellmatthew/lastfm-bulk-edit/master/lastfm-bulk-edit.user.js
// @downloadURL https://raw.githubusercontent.com/caldwellmatthew/lastfm-bulk-edit/master/lastfm-bulk-edit.user.js
// @supportURL  https://github.com/caldwellmatthew/lastfm-bulk-edit/issues
// @match       https://www.last.fm/*
// @require     https://cdnjs.cloudflare.com/ajax/libs/he/1.2.0/he.min.js
// ==/UserScript==

'use strict';

const namespace = 'lastfm-bulk-edit';

// use the top-right link to determine the current user
const authLink = document.querySelector('a.auth-link');

if (!authLink) {
    return; // not logged in
}

const libraryURL = `${authLink.href}/library`;

// https://regex101.com/r/KwEMRx/1
const albumRegExp = new RegExp(`^${libraryURL}/music(/\\+[^/]*)*(/[^+][^/]*){2}$`);
const artistRegExp = new RegExp(`^${libraryURL}/music(/\\+[^/]*)*(/[^+][^/]*){1}$`);
const parentheticalRegExp = /( \([^()]+\))$/;
const dashRegExp = /( - [^-]+)$/;

const domParser = new DOMParser();

const editScrobbleFormTemplate = document.createElement('template');
editScrobbleFormTemplate.innerHTML = `
    <form method="POST" action="${libraryURL}/edit?edited-variation=library-track-scrobble" data-edit-scrobble="">
        <input type="hidden" name="csrfmiddlewaretoken" value="">
        <input type="hidden" name="artist_name" value="">
        <input type="hidden" name="track_name" value="">
        <input type="hidden" name="album_name" value="">
        <input type="hidden" name="album_artist_name" value="">
        <input type="hidden" name="timestamp" value="">
        <button type="submit" class="mimic-link dropdown-menu-clickable-item more-item--edit">
            Edit scrobbles
        </button>
    </form>`;

const modalTemplate = document.createElement('template');
modalTemplate.innerHTML = `
    <div class="popup_background"
        style="opacity: 0.8; visibility: visible; background-color: rgb(0, 0, 0); position: fixed; top: 0px; right: 0px; bottom: 0px; left: 0px;">
    </div>
    <div class="popup_wrapper popup_wrapper_visible" style="opacity: 1; visibility: visible; position: fixed; overflow: auto; width: 100%; height: 100%; top: 0px; left: 0px; text-align: center;">
        <div class="modal-dialog popup_content" role="dialog" aria-labelledby="modal-label" data-popup-initialized="true" aria-hidden="false" style="opacity: 1; visibility: visible; pointer-events: auto; display: inline-block; outline: none; text-align: left; position: relative; vertical-align: middle;" tabindex="-1">
            <div class="modal-content">
                <div class="modal-body">
                    <h2 class="modal-title"></h2>
                </div>
            </div>
        </div>
        <div class="popup_align" style="display: inline-block; vertical-align: middle; height: 100%;"></div>
    </div>`;

initialize();

function initialize() {
    appendStyle();
    appendEditScrobbleHeaderLinkAndMenuItems(document);

    // use MutationObserver because Last.fm is a single-page application

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof Element) {
                    appendEditScrobbleHeaderLinkAndMenuItems(node);
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function appendStyle() {
    const style = document.createElement('style');

    style.innerHTML = `
        .${namespace}-abbr {
            cursor: pointer;
        }

        .${namespace}-ellipsis {
            display: block;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .${namespace}-form-group-controls {
            margin-left: 0 !important;
        }

        .${namespace}-list {
            column-count: 2;
        }

        .${namespace}-loading {
            background: url("/static/images/loading_dark_light_64.gif") 50% 50% no-repeat;
            height: 64px;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .${namespace}-text-danger {
            color: #d92323;
        }

        .${namespace}-text-info {
            color: #2b65d9;
        }

        .${namespace}-track-title-edit {
            margin-top: 5px!important;
        }`;

    document.head.appendChild(style);
}

function appendEditScrobbleHeaderLinkAndMenuItems(element) {
    if (!document.URL.startsWith(libraryURL)) {
        return; // current page is not the user's library
    }

    appendEditScrobbleHeaderLink(element);
    appendEditScrobbleHeaderLink(element, true);
    appendEditScrobbleMenuItems(element);
}

function appendEditScrobbleHeaderLink(element, thisPageOnly = false) {
    const header = element.querySelector('.library-header');

    if (header === null) {
        return; // current page does not contain the header we're looking for
    }

    const form = getEditScrobbleForm(document.URL, null, thisPageOnly);
    const button = form.querySelector('button');

    // replace submit button with a link

    form.style.display = 'inline';
    button.style.display = 'none';

    const link = form.appendChild(document.createElement('a'));
    link.href = 'javascript:void(0)';
    link.role = 'button';
    link.textContent = thisPageOnly ? 'Edit only these scrobbles' : 'Edit scrobbles';
    link.addEventListener('click', () => button.click());

    header.insertAdjacentText('beforeend', ' · ');
    header.insertAdjacentElement('beforeend', form);
}

function appendEditScrobbleMenuItems(element) {
    const tables = element.querySelectorAll('table.chartlist');

    for (const table of tables) {
        for (const row of table.tBodies[0].rows) {
            const link = row.querySelector('a.chartlist-count-bar-link');

            if (!link) {
                continue; // this is not an artist, album or track
            }

            const form = getEditScrobbleForm(link.href, row);

            const editScrobbleMenuItem = document.createElement('li');
            editScrobbleMenuItem.appendChild(form);

            // append new menu item to the DOM
            const menu = row.querySelector('.chartlist-more-menu');
            menu.insertBefore(editScrobbleMenuItem, menu.firstElementChild);
        }
    }
}

function getEditScrobbleForm(url, row, thisPageOnly = false) {
    const urlType = getUrlType(url);

    const form = editScrobbleFormTemplate.content.cloneNode(true).querySelector('form');
    const button = form.querySelector('button');

    let allScrobbleData;
    let scrobbleData;
    let submit = false;

    button.addEventListener('click', async event => {
        if (!submit) {
            event.stopImmediatePropagation();
            return;
        }

        const loadingModal = createLoadingModal('Waiting for Last.fm...');
        await augmentEditScrobbleForm(urlType, scrobbleData);
        loadingModal.hide();

        submit = false;
    });

    form.addEventListener('submit', async event => {
        if (submit) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        if (!allScrobbleData) {
            const loadingModal = createLoadingModal('Loading Scrobbles...', { display: 'percentage' });
            allScrobbleData = await fetchScrobbleData(url, loadingModal, null, thisPageOnly);
            loadingModal.hide();
        }

        scrobbleData = allScrobbleData;

        // use JSON strings as album keys to uniquely identify combinations of album + album artists
        // group scrobbles by album key
        let scrobbleDataGroups = [...groupBy(allScrobbleData, s => JSON.stringify({
            album_name: s.get('album_name') || '',
            album_artist_name: s.get('album_artist_name') || ''
        }))];

        // sort groups by the amount of scrobbles
        scrobbleDataGroups = scrobbleDataGroups.sort(([_key1, values1], [_key2, values2]) => values2.length - values1.length);

        // when editing multiple albums album, show an album selection dialog first
        if (scrobbleDataGroups.length >= 2) {
            const noAlbumKey = JSON.stringify({ album_name: '', album_artist_name: '' });
            let currentAlbumKey = undefined;

            // put the "No Album" album first
            scrobbleDataGroups = scrobbleDataGroups.sort(([key1], [key2]) => {
                if (key1 === noAlbumKey) return -1;
                if (key2 === noAlbumKey) return +1;
                return 0;
            });

            // when the edit dialog was initiated from an album or album track, put that album first in the list
            if (urlType === 'album' || getUrlType(document.URL) === 'album') {
                // grab the current album name and artist name from the DOM
                const album_name = (urlType === 'album' && row
                    ? row.querySelector('.chartlist-name')
                    : document.querySelector('.library-header-title')).textContent.trim();
                const album_artist_name = (urlType === 'album' && row
                    ? row.querySelector('.chartlist-artist') || document.querySelector('.library-header-title, .library-header-crumb')
                    : document.querySelector('.text-colour-link')).textContent.trim();
                currentAlbumKey = JSON.stringify({ album_name, album_artist_name });

                // put the current album first
                scrobbleDataGroups = scrobbleDataGroups.sort(([key1], [key2]) => {
                    if (key1 === currentAlbumKey) return -1;
                    if (key2 === currentAlbumKey) return +1;
                    if (key1 === noAlbumKey) return -1;
                    if (key2 === noAlbumKey) return +1;
                    return 0;
                });
            }

            const body = document.createElement('div');
            body.innerHTML = `
                <div class="form-disclaimer">
                    <div class="alert alert-info">
                        Scrobbles from this ${urlType} are spread out across multiple albums.
                        Select which albums you would like to edit.
                        Deselect albums you would like to skip.
                    </div>
                </div>
                <div class="form-group">
                    <div class="form-group-controls ${namespace}-form-group-controls">
                        <button type="button" class="btn-secondary" id="${namespace}-select-all">Select all</button>
                        <button type="button" class="btn-secondary" id="${namespace}-deselect-all">Deselect all</button>
                    </div>
                </div>
                <ul class="${namespace}-list">
                    ${scrobbleDataGroups.map(([key, scrobbleData], index) => {
                        const firstScrobbleData = scrobbleData[0];
                        const album_name = firstScrobbleData.get('album_name');
                        const artist_name = firstScrobbleData.get('album_artist_name') || firstScrobbleData.get('artist_name');

                        return `
                            <li>
                                <div class="checkbox">
                                    <label>
                                        <input type="checkbox" name="key" value="${he.escape(key)}" ${currentAlbumKey === undefined || currentAlbumKey === key ? 'checked' : ''} />
                                        <strong title="${he.escape(album_name || '')}" class="${namespace}-ellipsis ${currentAlbumKey === key ? `${namespace}-text-info` : !album_name ? `${namespace}-text-danger` : ''}">
                                            ${album_name ? he.escape(album_name) : '<em>No Album</em>'}
                                        </strong>
                                        <div title="${he.escape(artist_name)}" class="${namespace}-ellipsis">
                                            ${he.escape(artist_name)}
                                        </div>
                                        <small>
                                            ${scrobbleData.length} scrobble${scrobbleData.length !== 1 ? 's' : ''}
                                        </small>
                                    </label>
                                </div>
                            </li>`;
                    }).join('')}
                </ul>`;

            const checkboxes = body.querySelectorAll('input[type="checkbox"]');

            body.querySelector(`#${namespace}-select-all`).addEventListener('click', () => {
                for (const checkbox of checkboxes) {
                    checkbox.checked = true;
                }
            });

            body.querySelector(`#${namespace}-deselect-all`).addEventListener('click', () => {
                for (const checkbox of checkboxes) {
                    checkbox.checked = false;
                }
            });

            let formData;
            try {
                formData = await prompt('Select Albums To Edit', body);
            } catch (error) {
                return; // user canceled the album selection dialog
            }

            const selectedAlbumKeys = formData.getAll('key');

            scrobbleData = flatten(scrobbleDataGroups
                .filter(([key]) => selectedAlbumKeys.includes(key))
                .map(([_, values]) => values));
        }

        if (scrobbleData.length === 0) {
            alert(`Last.fm reports you haven't listened to this ${urlType}.`);
            return;
        }

        // use the first scrobble to trick Last.fm into fetching the Edit Scrobble modal
        applyFormData(form, scrobbleData[0]);
        submit = true;
        button.click();
    });

    return form;
}

// shows a form dialog and resolves it's promise on submit
function prompt(title, body) {
    return new Promise((resolve, reject) => {
        const form = document.createElement('form');
        form.className = 'form-horizontal';

        if (body instanceof Node) {
            form.insertAdjacentElement('beforeend', body);
        } else {
            form.insertAdjacentHTML('beforeend', body);
        }

        form.insertAdjacentHTML('beforeend', `
            <div class="form-group form-group--submit">
                <div class="form-submit">
                    <button type="reset" class="btn-secondary">Cancel</button>
                    <button type="submit" class="btn-primary">
                        <span class="btn-inner">
                            OK
                        </span>
                    </button>
                </div>
            </div>`);

        const content = document.createElement('div');
        content.className = 'content-form';
        content.appendChild(form);

        const modal = createModal(title, content, {
            dismissible: true,
            events: {
                hide: reject
            }
        });

        form.addEventListener('reset', () => modal.hide());
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            resolve(new FormData(form));
            modal.hide();
        });

        modal.show();
    });
}

function createModal(title, body, options) {
    const fragment = modalTemplate.content.cloneNode(true);

    const modalTitle = fragment.querySelector('.modal-title');
    if (title instanceof Node) {
        modalTitle.insertAdjacentElement('beforeend', title);
    } else {
        modalTitle.insertAdjacentHTML('beforeend', title);
    }

    const modalBody = fragment.querySelector('.modal-body');
    if (body instanceof Node) {
        modalBody.insertAdjacentElement('beforeend', body);
    } else {
        modalBody.insertAdjacentHTML('beforeend', body);
    }

    const element = document.createElement('div');

    if (options && options.dismissible) {
        // create X button that closes the modal
        const closeButton = document.createElement('button');
        closeButton.className = 'modal-dismiss sr-only';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', () => hide());

        // create modal actions div
        const modalActions = document.createElement('div');
        modalActions.className = 'modal-actions';
        modalActions.appendChild(closeButton);


        // append X button to DOM
        const modalContent = fragment.querySelector('.modal-content');
        modalContent.insertBefore(modalActions, modalContent.firstElementChild);

        // close modal when user clicks outside modal
        const popupWrapper = fragment.querySelector('.popup_wrapper');
        popupWrapper.addEventListener('click', event => {
            if (!modalContent.contains(event.target)) {
                hide();
            }
        });
    }

    element.appendChild(fragment);

    let addedClass = false;

    function show() {
        if (element.parentNode) return;
        document.body.appendChild(element);

        if (!document.documentElement.classList.contains('popup_visible')) {
            document.documentElement.classList.add('popup_visible');
            addedClass = true;
        }
    }

    function hide() {
        if (!element.parentNode) return;
        element.parentNode.removeChild(element);

        if (addedClass) {
            document.documentElement.classList.remove('popup_visible');
            addedClass = false;
        }

        if (options && options.events && options.events.hide) {
            options.events.hide();
        }
    }

    return { element, show, hide };
}

function createLoadingModal(title, options) {
    const body = `
        <div class="${namespace}-loading">
            <div class="${namespace}-progress"></div>
        </div>`;

    const modal = createModal(title, body);
    const progress = modal.element.querySelector(`.${namespace}-progress`);

    // extend modal with custom properties
    modal.steps = [];
    modal.refreshProgress = () => {
        switch (options && options.display) {
            case 'count':
                progress.textContent = `${modal.steps.filter(s => s.completed).length} / ${modal.steps.length}`;
                break;

            case 'percentage':
                const completionRatio = getCompletionRatio(modal.steps);
                progress.textContent = Math.floor(completionRatio * 100) + '%';
                break;
        }
    };

    modal.refreshProgress();
    modal.show();

    return modal;
}

// calculates the completion ratio from a tree of steps with weights and child steps
function getCompletionRatio(steps) {
    const totalWeight = steps.map(s => s.weight).reduce((a, b) => a + b, 0);
    if (totalWeight === 0) return 0;
    const completedWeight = steps.map(s => s.weight * (s.completed ? 1 : getCompletionRatio(s.steps))).reduce((a, b) => a + b, 0);
    return completedWeight / totalWeight;
}

// this is a recursive function that browses pages of artists, albums and tracks to gather scrobbles
async function fetchScrobbleData(url, loadingModal, parentStep, thisPageOnly = false) {
    if (!parentStep) parentStep = loadingModal;

    // remove "?date_preset=LAST_365_DAYS", etc., unless only scrobbling current page
    const indexOfQuery = url.indexOf('?');
    if (indexOfQuery !== -1 && !thisPageOnly) {
        url = url.substr(0, indexOfQuery);
    }

    if (getUrlType(url) === 'artist') {
        url += '/+tracks'; // skip artist overview and go straight to the tracks
    }

    const documentsToFetch = [fetchHTMLDocument(url)];
    const firstDocument = await documentsToFetch[0];
    const paginationList = firstDocument.querySelector('.pagination-list');

    if (paginationList) {
        const pageCount = parseInt(paginationList.children[paginationList.children.length - 2].textContent.trim(), 10);
        const pageNumbersToFetch = [...Array(pageCount - 1).keys()].map(i => i + 2);
        documentsToFetch.push(...pageNumbersToFetch.map(n => fetchHTMLDocument(`${url}?page=${n}`)));
    }

    let scrobbleData = await forEachParallel(loadingModal, parentStep, documentsToFetch, async (documentToFetch, step) => {
        const fetchedDocument = await documentToFetch;

        const table = fetchedDocument.querySelector('table.chartlist:not(.chartlist__placeholder)');
        if (!table) {
            // sometimes a missing chartlist is expected, other times it indicates a failure
            if (fetchedDocument.body.textContent.includes('There was a problem loading your')) {
                abort();
            }
            return [];
        }

        const rows = [...table.tBodies[0].rows];

        // to display accurate loading percentages, tracks with more scrobbles will have more weight
        const weightFunc = row => {
            const barValue = row.querySelector('.chartlist-count-bar-value');
            if (barValue === null) return 1;
            const scrobbleCount = parseInt(barValue.firstChild.textContent.trim().replace(/,/g, ''), 10);
            return Math.ceil(scrobbleCount / 50); // 50 = items per page on Last.fm
        };

        return await forEachParallel(loadingModal, step, rows, async (row, step) => {
            const link = row.querySelector('.chartlist-count-bar-link');
            if (link) {
                // recursive call to the current function
                return await fetchScrobbleData(link.href, loadingModal, step);
            }

            // no link indicates we're at the scrobble overview
            const form = row.querySelector('form[data-edit-scrobble]');
            return new FormData(form);
        }, weightFunc);
    });

    return scrobbleData;
}

function getUrlType(url) {
    if (albumRegExp.test(url)) {
        return 'album';
    } else if (artistRegExp.test(url)) {
        return 'artist';
    } else {
        return 'track';
    }
}

async function fetchHTMLDocument(url) {
    // retry 5 times with exponential timeout
    for (let i = 0; i < 5; i++) {
        if (i !== 0) {
            // wait 2 seconds, then 4 seconds, then 8, finally 16 (30 seconds total)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i)));
        }

        const response = await fetch(url);

        if (response.ok) {
            const html = await response.text();
            const doc = domParser.parseFromString(html, 'text/html');

            if (doc.querySelector('table.chartlist') || i === 4) {
                return doc;
            }
        }
    }

    abort();
}

let aborting = false;

function abort() {
    if (aborting) return;
    aborting = true;
    alert('There was a problem loading your scrobbles, please try again later.');
    window.location.reload();
}

// series for loop that updates the loading percentage
async function forEach(loadingModal, parentStep, array, callback, weightFunc) {
    const tuples = array.map(item => ({ item, step: { weight: weightFunc ? weightFunc(item) : 1, steps: [] } }));
    parentStep.steps.push(...tuples.map(tuple => tuple.step));
    loadingModal.refreshProgress();

    const result = [];
    for (const tuple of tuples) {
        result.push(await callback(tuple.item, tuple.step));
        tuple.step.completed = true;
        loadingModal.refreshProgress();
    }

    return flatten(result);
}

// parallel for loop that updates the loading percentage
async function forEachParallel(loadingModal, parentStep, array, callback, weightFunc) {
    const tuples = array.map(item => ({ item, step: { weight: weightFunc ? weightFunc(item) : 1, steps: [] } }));
    parentStep.steps.push(...tuples.map(tuple => tuple.step));
    loadingModal.refreshProgress();

    const result = await Promise.all(tuples.map(async tuple => {
        const result = await callback(tuple.item, tuple.step);
        tuple.step.completed = true;
        loadingModal.refreshProgress();
        return result;
    }));

    return flatten(result);
}

// because Edge does not support Array.prototype.flat()
function flatten(array) {
    return array.reduce((flat, toFlatten) => {
        return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
    }, []);
}

function applyFormData(form, formData) {
    for (const [name, value] of formData) {
        const input = form.elements[name];
        input.value = value;
    }
}

// augments the default Edit Scrobble form to include new features
async function augmentEditScrobbleForm(urlType, scrobbleData) {
    const wrapper = await observeChildList(document.body, '.popup_wrapper');

    // wait 1 frame
    await new Promise(resolve => setTimeout(() => { resolve(); }));

    const popup = wrapper.querySelector('.popup_content');
    const title = popup.querySelector('.modal-title');
    const form = popup.querySelector('form[action$="/library/edit?edited-variation=library-track-scrobble"]');

    title.textContent = `Edit ${urlType[0].toUpperCase() + urlType.slice(1)} Scrobbles`;

    // remove traces of the first scrobble that was used to initialize the form
    form.removeChild(form.querySelector('.form-group--timestamp'));
    form.removeChild(form.elements['track_name_original']);
    form.removeChild(form.elements['artist_name_original']);
    form.removeChild(form.elements['album_name_original']);
    form.removeChild(form.elements['album_artist_name_original']);

    const track_name_input = form.elements['track_name'];
    const artist_name_input = form.elements['artist_name'];
    const album_name_input = form.elements['album_name'];
    const album_artist_name_input = form.elements['album_artist_name'];

    augmentInput(urlType, scrobbleData, popup, track_name_input, 'tracks');
    augmentInput(urlType, scrobbleData, popup, artist_name_input, 'artists');
    augmentInput(urlType, scrobbleData, popup, album_name_input, 'albums');
    augmentInput(urlType, scrobbleData, popup, album_artist_name_input, 'album artists');

    // keep album artist name in sync
    let previousValue = artist_name_input.value;
    artist_name_input.addEventListener('input', () => {
        if (album_artist_name_input.value === previousValue) {
            album_artist_name_input.value = artist_name_input.value;
            album_artist_name_input.dispatchEvent(new Event('input'));
        }
        previousValue = artist_name_input.value;
    });

    if (album_artist_name_input.placeholder === 'Mixed') {
        const template = document.createElement('template');
        template.innerHTML = `
            <div class="form-group-success">
                <div class="alert alert-info">
                    <p>Matching album artists will be kept in sync.</p>
                </div>
            </div>`;
        artist_name_input.parentNode.insertBefore(template.content, artist_name_input.nextElementChild);
    }

    // replace the "Edit all" checkbox with one that cannot be disabled
    let editAllFormGroup = form.querySelector('.form-group--edit_all');
    if (editAllFormGroup) form.removeChild(editAllFormGroup);

    const summary = `${urlType !== 'artist' ? 'artist, ' : ''}${urlType !== 'track' ? 'track, ' : ''}${urlType !== 'album' ? 'album, ' : ''}and album artist`;
    const editAllFormGroupTemplate = document.createElement('template');
    editAllFormGroupTemplate.innerHTML = `
        <div class="form-group form-group--edit_all js-form-group">
            <label for="id_edit_all" class="control-label">Bulk edit</label>
            <div class="js-form-group-controls form-group-controls">
                <div class="checkbox">
                    <label for="id_edit_all">
                        <input id="id_edit_all" type="checkbox" checked disabled>
                        <input name="edit_all" type="hidden" value="true">
                        Edit all
                        <span class="abbr" title="You have scrobbled any combination of ${summary} ${scrobbleData.length} times">
                            ${scrobbleData.length} scrobbles
                        </span>
                        of this ${urlType}
                    </label>
                </div>
            </div>
        </div>`;

    editAllFormGroup = editAllFormGroupTemplate.content.cloneNode(true);
    form.insertBefore(editAllFormGroup, form.lastElementChild);

    // each exact track, artist, album and album artist combination is considered a distinct scrobble
    const distinctGroups = groupBy(scrobbleData, s => JSON.stringify({
        track_name: s.get('track_name'),
        artist_name: s.get('artist_name'),
        album_name: s.get('album_name') || '',
        album_artist_name: s.get('album_artist_name') || ''
    }));

    const distinctScrobbleData = [...distinctGroups].map(([name, values]) => values[0]);

    const trackNames = distinctScrobbleData.map(originalData => originalData.get('track_name'));
    const commonSuffix = longestCommonSuffix(trackNames);

    if (trackNames.length > 1 && commonSuffix) {
        const template = document.createElement('template');
        template.innerHTML = `
            <div class="form-group js-form-group">
                <label for="remove_common" class="control-label">Common suffix</label>
                <div class="js-form-group-controls form-group-controls">
                    <div class="checkbox">
                        <label for="remove_common">
                            <input id="remove_common" type="checkbox">
                            Remove <strong>${commonSuffix}</strong> from track titles
                        </label>
                    </div>
                </div>
            </div>`;

        const artistNameFormGroup = artist_name_input.parentNode.parentNode;
        form.insertBefore(template.content, artistNameFormGroup);
    }

    // add buttons to auto-strip fields
    const autoStripTemplate = document.createElement('template');
    autoStripTemplate.innerHTML = `
        <span style="text-decoration: underline; cursor: pointer;">
            Auto-strip
        </span>`;

    function strip(input) {
        if (input.value.match(parentheticalRegExp)) {
            input.value = input.value.replace(parentheticalRegExp, '');
        } else if (input.value.match(dashRegExp)) {
            input.value = input.value.replace(dashRegExp, '');
        }
    }

    const trackEditForms = distinctScrobbleData.reduce((acc, data, i) => {
        const title = data.get('track_name');
        const input = document.createElement('input');
        input.type = 'text';
        input.value = title;
        input.classList.add(`${namespace}-track-title-edit`);
        acc[title] = input;
        return acc;
    }, {});
    
    const trackListEdit = document.createElement('div');
    trackListEdit.classList.add('hidden');
    for (const title in trackEditForms) {
        trackListEdit.appendChild(trackEditForms[title]);
    }
    const stripTrack = autoStripTemplate.content.cloneNode(true).firstElementChild;
    stripTrack.addEventListener('click', () => {
        for (const title in trackEditForms) {
            const input = trackEditForms[title];
            strip(input);
        }
    });
    trackListEdit.appendChild(stripTrack);
    
    const expandButton = document.createElement('span');
    expandButton.innerHTML = '&#9660';
    expandButton.style = 'cursor: pointer;';
    expandButton.addEventListener('click', () => {
        trackListEdit.classList.toggle('hidden');
    });

    const singleInputs = [artist_name_input, album_name_input, album_artist_name_input];

    if (distinctScrobbleData.length > 1) {
        track_name_input.parentNode.insertBefore(expandButton, track_name_input.nextElementChild);
        track_name_input.parentNode.insertBefore(trackListEdit, track_name_input.nextElementChild);
    } else {
        singleInputs.push(track_name_input);
    }    

    for (const input of singleInputs) {
        const stripTrack = autoStripTemplate.content.cloneNode(true).firstElementChild;
        stripTrack.addEventListener('click', () => strip(input));
        input.parentNode.appendChild(stripTrack);
    }
    
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.addEventListener('click', async event => {
        event.preventDefault();

        for (const element of form.elements) {
            if (element.dataset.confirm && element.placeholder !== 'Mixed') {
                if (confirm(element.dataset.confirm)) {
                    delete element.dataset.confirm; // don't confirm again when resubmitting
                } else {
                    return; // stop submit
                }
            }
        }

        const formData = new FormData(form);
        const formDataToSubmit = [];

        const track_name = getMixedInputValue(track_name_input);
        const artist_name = getMixedInputValue(artist_name_input);
        const album_name = getMixedInputValue(album_name_input);
        const album_artist_name = getMixedInputValue(album_artist_name_input);

        const removeCommonSuffix = form.elements['remove_common']?.checked;

        for (const originalData of distinctScrobbleData) {
            const track_name_original = originalData.get('track_name');
            const artist_name_original = originalData.get('artist_name');
            const album_name_original = originalData.get('album_name') || '';
            const album_artist_name_original = originalData.get('album_artist_name') || '';

            // if the album artist field is Mixed, use the old and new artist names to keep the album artist in sync
            const album_artist_name_sync = album_artist_name_input.placeholder === 'Mixed' && distinctScrobbleData.some(s => s.get('artist_name') === album_artist_name_original)
                ? artist_name
                : album_artist_name;

            const updatedTrackName = trackEditForms[track_name_original]?.value;
            const updateTrackName = updatedTrackName !== track_name_original;

            // check if anything changed compared to the original track, artist, album and album artist combination
            if (track_name             !== null && track_name             !== track_name_original        ||
                artist_name            !== null && artist_name            !== artist_name_original       ||
                album_name             !== null && album_name             !== album_name_original        ||
                album_artist_name_sync !== null && album_artist_name_sync !== album_artist_name_original ||
                removeCommonSuffix || updateTrackName) {

                const clonedFormData = cloneFormData(formData);

                // Last.fm expects a timestamp
                clonedFormData.set('timestamp', originalData.get('timestamp'));

                // populate the *_original fields to instruct Last.fm which scrobbles need to be edited

                clonedFormData.set('track_name_original', track_name_original);
                if (track_name === null) {
                    clonedFormData.set('track_name', track_name_original);
                }
                if (removeCommonSuffix) {
                    const strippedTrackName = track_name_original.replace(commonSuffix, '');
                    clonedFormData.set('track_name', strippedTrackName);
                }
                if (updateTrackName) {
                    clonedFormData.set('track_name', updatedTrackName);
                }

                clonedFormData.set('artist_name_original', artist_name_original);
                if (artist_name === null) {
                    clonedFormData.set('artist_name', artist_name_original);
                }

                clonedFormData.set('album_name_original', album_name_original);
                if (album_name === null) {
                    clonedFormData.set('album_name', album_name_original);
                }

                clonedFormData.set('album_artist_name_original', album_artist_name_original);
                if (album_artist_name_sync === null) {
                    clonedFormData.set('album_artist_name', album_artist_name_original);
                } else {
                    clonedFormData.set('album_artist_name', album_artist_name_sync);
                }

                formDataToSubmit.push(clonedFormData);
            }
        }

        if (formDataToSubmit.length === 0) {
            alert('Your edit doesn\'t contain any real changes.'); // TODO: pretty validation messages
            return;
        }

        // hide the Edit Scrobble form
        const cancelButton = form.querySelector('button.js-close');
        cancelButton.click();

        const loadingModal = createLoadingModal('Saving Edits...', { display: 'count' });
        const parentStep = loadingModal;

        // run edits in series, inconsistencies will arise if you use a parallel loop
        await forEach(loadingModal, parentStep, formDataToSubmit, async formData => {
            // Edge does not support passing formData into URLSearchParams() constructor
            const body = new URLSearchParams();
            for (const [name, value] of formData) {
                body.append(name, value);
            }

            const response = await fetch(form.action, { method: 'POST', body: body });
            const html = await response.text();

            // use DOMParser to check the response for alerts
            const placeholder = domParser.parseFromString(html, 'text/html');

            for (const message of placeholder.querySelectorAll('.alert-danger')) {
                alert(message.textContent.trim()); // TODO: pretty validation messages
            }
        });

        // Last.fm sometimes displays old data when reloading too fast, so wait 1 second
        setTimeout(() => { window.location.reload(); }, 1000);
    });
}

// helper function that completes when a matching element gets appended
function observeChildList(target, selector) {
    return new Promise(resolve => {
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.matches(selector)) {
                        observer.disconnect();
                        resolve(node);
                        return;
                    }
                }
            }
        });

        observer.observe(target, { childList: true });
    });
}

// turns a normal input into an input that supports the "Mixed" state
function augmentInput(urlType, scrobbleData, popup, input, plural) {
    const groups = [...groupBy(scrobbleData, s => s.get(input.name))].sort((a, b) => b[1].length - a[1].length);

    if (groups.length >= 2) {
        // display the "Mixed" placeholder when there are two or more possible values
        input.value = '';
        input.placeholder = 'Mixed';

        const tab = '\xa0'.repeat(8); // 8 non-breaking spaces

        const abbr = document.createElement('span');
        abbr.className = `abbr ${namespace}-abbr`;
        abbr.textContent = `${groups.length} ${plural}`;
        abbr.title = groups.map(([key, values]) => `${values.length}x${tab}${key || ''}`).join('\n');
        input.parentNode.insertBefore(abbr, input.nextElementChild);

        input.dataset.confirm = `You are about to merge scrobbles for ${groups.length} ${plural}. This cannot be undone. Would you like to continue?`;

        // datalist: a native HTML5 autocomplete feature
        const datalist = document.createElement('datalist');
        datalist.id = `${namespace}-${popup.id}-${input.name}-datalist`;

        for (const [key] of groups) {
            const option = document.createElement('option');
            option.value = key || '';
            datalist.appendChild(option);
        }

        input.autocomplete = 'off';
        input.setAttribute('list', datalist.id);
        input.parentNode.insertBefore(datalist, input.nextElementChild);
    }

    // display green color when field was edited, red if it's not allowed to be empty
    const formGroup = input.closest('.form-group');
    const defaultValue = input.value;

    input.addEventListener('input', () => {
        input.placeholder = ''; // removes "Mixed" state
        refreshFormGroupState();
    });

    input.addEventListener('keydown', event => {
        if (event.keyCode === 8 || event.keyCode === 46) { // backspace or delete
            input.placeholder = ''; // removes "Mixed" state
            refreshFormGroupState();
        }
    });

    function refreshFormGroupState() {
        formGroup.classList.remove('has-error');
        formGroup.classList.remove('has-success');

        if (input.value !== defaultValue || groups.length >= 2 && input.placeholder === '') {
            if (input.value === '' && (input.name === 'track_name' || input.name === 'artist_name')) {
                formGroup.classList.add('has-error');
            } else {
                formGroup.classList.add('has-success');
            }
        }
    }
}

function groupBy(array, keyFunc) {
    const map = new Map();

    for (const item of array) {
        const key = keyFunc(item);
        const value = map.get(key);
        if (!value) {
            map.set(key, [item]);
        } else {
            value.push(item);
        }
    }

    return map;
}

function getMixedInputValue(input) {
    return input.placeholder !== 'Mixed' ? input.value : null;
}

function cloneFormData(formData) {
    const clonedFormData = new FormData();

    for (const [name, value] of formData) {
        clonedFormData.append(name, value);
    }

    return clonedFormData;
}

function longestCommonPrefix(strings) {
    const sorted = strings.sort();
    const first = sorted[0], last = sorted[sorted.length - 1];
    let i;
    for (i = 0; i < first.length && first[i] === last[i]; i++);
    return first.substring(0, i);
}

function longestCommonSuffix(strings) {
    const reversed = strings.map(str => str.split('').reverse().join(''));
    return longestCommonPrefix(reversed).split('').reverse().join('');
}
