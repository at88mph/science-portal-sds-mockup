let imageData = {};
let imageSearchSortDescending = false;
const COLOUR_STATUS_CODES = {
    "STABLE": "success",
    "BETA": "warning",
    "ALPHA": "secondary",
    "TESTING": "info",
    "DEPRECATED": "danger"
}

const escapeHtml = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const debounce = (func, delay) => {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
};

function simulateNetworkDelay() {
    const ms = (Math.random() * 1000) + 150;
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** SDS may store Docker refs without a scheme (images.canfar.net/project/name:tag). */
function imageLocationAsUrl(location) {
    const s = String(location || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return `https://${s}`;
}

function pathnameFromImageLocation(location) {
    const href = imageLocationAsUrl(location);
    if (!href) return '';
    const parsed = typeof URL.parse === 'function' ? URL.parse(href) : null;
    if (parsed && parsed.pathname) return parsed.pathname;
    try {
        return new URL(href).pathname || '';
    } catch {
        return '';
    }
}

/** Path like /project/repo:tag or legacy /repo/version */
function parseImageRegistryPath(pathname) {
    const p = (pathname || '').replace(/^\/+/, '');
    if (!p) return { imageName: '', imageVersion: '' };
    const parts = p.split('/');
    const last = parts[parts.length - 1] || '';
    const colonIdx = last.indexOf(':');
    if (colonIdx > 0) {
        return {
            imageName: last.slice(0, colonIdx),
            imageVersion: last.slice(colonIdx + 1)
        };
    }
    if (parts.length >= 2) {
        return {
            imageName: parts[parts.length - 2],
            imageVersion: parts[parts.length - 1]
        };
    }
    return { imageName: last, imageVersion: '' };
}

const SDS_INFO_POPOVER_TITLE = 'Software Discovery Service';
const SDS_INFO_POPOVER_BODY = 'The Software Discovery Service (SDS) catalogs science software and container images: descriptions, requirements, registry locations, and discovery metadata. This dialog searches the SDS-backed image list served by this portal.';

function initImageSDSInfoPopover() {
    const $btn = $('#image_sds_info_btn');
    if (!$btn.length) {
        return;
    }
    $btn.popover('dispose');
    $btn.popover({
        container: 'body',
        placement: 'auto',
        trigger: 'click',
        html: true,
        title: SDS_INFO_POPOVER_TITLE,
        content: SDS_INFO_POPOVER_BODY,
        template: '<div class="popover image-sds-popover" role="tooltip"><div class="arrow"></div><h3 class="popover-header"></h3><div class="popover-body"></div></div>'
    });
    $btn.off('shown.bs.popover.sds hidden.bs.popover.sds');
    $btn.on('shown.bs.popover.sds', function onShown() {
        $(this).attr('aria-expanded', 'true');
    });
    $btn.on('hidden.bs.popover.sds', function onHidden() {
        $(this).attr('aria-expanded', 'false');
    });
}

function attachImageSDSPopoverOutsideClose() {
    $(document).off('click.imageSdsPopoverDismiss').on('click.imageSdsPopoverDismiss', function (e) {
        const $btn = $('#image_sds_info_btn');
        if (!$btn.length) {
            return;
        } else if ($(e.target).closest('#image_sds_info_btn').length) {
            return;
        }
        else if ($(e.target).closest('.popover').length) {
            return;
        }
        $btn.popover('hide');
    });
}

function disposeImageSDSInfoPopover() {
    const $btn = $('#image_sds_info_btn');
    if ($btn.length) {
        $btn.popover('dispose');
        $btn.attr('aria-expanded', 'false');
    }
    $(document).off('click.imageSdsPopoverDismiss');
}

function getImageSearchTerms() {
    const $input = $('#image_search_input');
    if ($input.data('tagsinput')) {
        return $input.tagsinput('items').map(function (t) {
            return String(t).toLowerCase().trim();
        }).filter(Boolean);
    }
    const raw = (document.getElementById('image_search_input').value || '').toLowerCase().trim();
    return raw ? [raw] : [];
}

function ensureImageSearchTagsInput() {
    const $input = $('#image_search_input');
    if (!$input.length) {
        return;
    }
    if (!$input.data('tagsinput')) {
        $input.tagsinput({
            trimValue: true,
            // 13: Enter, 44: Comma, 32: Space, 186: Semicolon
            confirmKeys: [13, 44, 32, 186],
            tagClass: 'badge badge-info'
        });
    }
    const debouncedSearch = debounce(searchImages, 350);
    $input.off('itemAdded.imageSearch itemRemoved.imageSearch change.imageSearch')
        .on('itemAdded.imageSearch itemRemoved.imageSearch change.imageSearch', debouncedSearch);
}

function setImageSDSStatus(state, detail) {
    const el = document.getElementById('image_sds_status');
    if (!el) return;
    el.classList.remove('badge-success', 'badge-danger', 'badge-secondary', 'badge-warning');
    if (state === 'loading') {
        el.classList.add('badge-secondary');
        el.textContent = 'SDS: checking…';
        el.title = 'Contacting the Software Discovery catalog on this portal.';
    } else if (state === 'up') {
        el.classList.add('badge-success');
        el.textContent = 'SDS: up';
        el.title = 'The Software Discovery catalog loaded successfully.';
    } else {
        el.classList.add('badge-danger');
        el.textContent = 'SDS: down';
        el.title = detail || 'The Software Discovery catalog could not be loaded.';
    }
}

async function openImageSearch() {
    query_params = {
        LANG: 'ADQL',
        RESPONSEFORMAT: 'csv',
        QUERY: 'select soft.uri, soft.status, soft.description, soft.release_date, res.min_memory, res.requires_gpu, art.cpu_architecture, art.location, art.supported_modes from sdm.software soft join sdm.resource_requirements res on soft.id = res.software_id join sdm.artifact art on soft.id = art.software_id join sdm.discovery disc on soft.id = disc.software_id join sdm.discovery_tools_included dti on disc.id = dti.discovery_id'
    };

    setImageSDSStatus('loading');
    current_host = window.location.hostname;
    current_port = window.location.port;
    await fetch(`http://${current_host}:${current_port}/science-portal/dist/js/images.json`)
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        imageData = data;
        setImageSDSStatus('up');
    })
    .catch(error => {
        console.error('Error fetching local image data:', error);
        setImageSDSStatus('down', error && error.message ? String(error.message) : undefined);
    });
    // await fetch(`http://${current_host}/tap/sync`, {
    //     method: 'POST',
    //     body: new URLSearchParams(query_params)
    // }).then(response => response.text()).then(csv => {
    //     Papa.parse(csv, {
    //         header: true,
    //         complete: (results) => {
    //             imageData = results.data.filter(image => image.uri && image.uri.trim() !== '');
    //         }
    //     });
    // }).catch(error => {
    //     console.error('Error fetching image data:', error);
    // });
}

/**
 * Apply SDS / registry image choice: set project + container image selects to match `location`.
 * @param {string} location Full ref e.g. images.canfar.net/canfar/astro-notebook:0.1.0
 */
function selectImage(location) {
    const loc = String(location || '').trim();
    const imageSelect = document.getElementById('image_select');
    const projectSelect = document.querySelector('select[name="project"]');
    if (!loc || !imageSelect) {
        $('#image_modal').modal('hide');
        return;
    }
    const path = pathnameFromImageLocation(loc);
    const segs = path.replace(/^\/+/, '').split('/').filter(Boolean);
    if (projectSelect && segs.length >= 1) {
        const project = segs[0];
        if (Array.from(projectSelect.options).some((o) => o.value === project)) {
            projectSelect.value = project;
        }
    }
    if (Array.from(imageSelect.options).some((o) => o.value === loc)) {
        imageSelect.value = loc;
    }
    $('#image_modal').modal('hide');
}

async function searchImages() {
    const terms = getImageSearchTerms();

    const includePrerelease = document.getElementById('image_search_include_prerelease')?.checked === true;
    const includeExperimental = document.getElementById('image_search_include_experimental')?.checked === true;
    const resultsContainer = document.getElementById('image_search_results');
    if (!resultsContainer) {
        return;
    }
    if (terms.length > 0) {
        resultsContainer.className = 'list-group d-flex justify-content-center align-items-center py-4';
        resultsContainer.innerHTML = `
            <div class="spinner-border text-secondary" role="status" style="width: 2rem; height: 2rem;">
                <span class="sr-only">Loading images…</span>
            </div>`;
        await simulateNetworkDelay();
    }
    resultsContainer.innerHTML = '';

    let filteredImages = terms.length > 0 ? imageData.filter(image => {
        const haystack = [
            image.uri || '',
            image.description || '',
            image.tools_included || '',
            image.science_category || '',
            image.function_category || ''
        ].join(' ').toLowerCase();
        return terms.every(term => haystack.includes(term));
    }) : [];

    filteredImages = filteredImages.filter((image) =>
        (image.status === 'STABLE') ||
        (includePrerelease && (image.status === 'ALPHA' || image.status === 'BETA')) ||
        (includeExperimental && image.status === 'TESTING')
    );

    filteredImages = filteredImages.slice().sort((a, b) => {
        const pa = pathnameFromImageLocation(a.location).toLowerCase();
        const pb = pathnameFromImageLocation(b.location).toLowerCase();
        const cmp = pa.localeCompare(pb);
        return imageSearchSortDescending ? -cmp : cmp;
    });

    if (filteredImages.length === 0) {
        resultsContainer.className = 'list-group';
        resultsContainer.innerHTML = '<p>No images found.</p>';
    } else {
        resultsContainer.className = 'row mt-4';
        const toolCountToShow = 5;
        filteredImages.forEach(image => {
            let parsedModesArray = image.supported_modes ? image.supported_modes.replace(/[\{\}]/g, '').split(',').filter(mode => mode.trim() !== '')?.map(mode => mode.toLowerCase().trim()) : [];
            const modesArray = parsedModesArray.length > 0 ? parsedModesArray : ['headless'];
            const toolsArray = image.tools_included ? image.tools_included.replace(/[\{\}]/g, '').split(',').map(tool => tool.trim()) : [];
            const toolsShown = toolsArray.slice(0, toolCountToShow);
            const toolsOverflow = toolsArray.length > toolCountToShow ? toolsArray.length - toolCountToShow : 0;
            let toolsHtml = '';
            if (toolsShown.length > 0) {
                let isNotFirst = false;
                const chips = toolsShown.map((tool) => {
                    const html = `<span class="badge badge-pill badge-light text-dark border small ml-${isNotFirst ? '1' : '0'} mb-1">${escapeHtml(tool)}</span>`;
                    isNotFirst = true;
                    return html;
                }).join('');
                const more = toolsOverflow > 0 ? `<span class="small text-muted align-self-center ml-1 mb-1">+${toolsOverflow}</span>` : '';
                toolsHtml = `
                    <div class="mt-auto pt-2 w-100 d-flex flex-wrap justify-content-start align-items-center">
                        ${chips}${more}
                    </div>`;
            }
            let gpuBadgeHtml = '';
            if (image.requires_gpu === 't') {
                gpuBadgeHtml = `<span class="badge badge-pill badge-gpu small mb-1">GPU</span>`;
            }
            const { imageName, imageVersion } = parseImageRegistryPath(pathnameFromImageLocation(image.location))
            const column = document.createElement('div');
            column.className = 'col-md-6 mb-3 d-flex align-items-stretch';
            const imageCard = document.createElement('div');
            imageCard.className = 'card w-100 d-flex flex-column';
            imageCard.innerHTML = `
                <button type="button" class="card-body btn btn-light text-left flex-grow-1 d-flex flex-column" onclick='selectImage(${JSON.stringify(image.location || '')})'>
                    <div class="row flex-grow-1">
                        <div class="col-sm-12 mb-2">
                            <div class="row align-items-center">
                                <div class="col-auto pr-2">
                                    <span class="badge badge-pill badge-${COLOUR_STATUS_CODES[image.status]}">${image.status}</span>
                                </div>
                                <div class="col overflow-hidden">
                                    <span class="card-title h5 mb-0 font-weight-bold text-truncate d-block">${imageName}<span class="text-muted small">${imageVersion ? ` v${imageVersion}` : ''}</span></span>
                                </div>
                            </div>
                            <div class="col-sm-10 text-left justify-content-start border-bottom border-gray-300 pt-2"></div>
                        </div>
                        <div class="col-sm-12 mb-1">
                            <p class="card-text small font-italic">${image.description ?? 'No description available'}</p>
                        </div>
                        <div class="col-sm-12 mt-0">
                            <div class="row">
                                <div class="col-sm-12">
                                    <div class="small mx-auto">
                                        ${gpuBadgeHtml} ${modesArray.map(mode => `<span class="badge badge-info badge-pill small">${mode}</span>`).join('&nbsp;')}
                                    </div>
                                </div>
                                <div class="col-sm-12 text-left justify-content-start">
                                    ${toolsHtml}
                                </div>
                            </div>
                        </div>
                    </div>
                </button>
            `;
            column.appendChild(imageCard);
            resultsContainer.appendChild(column);
        });
    }
}

$("#image_modal").on("shown.bs.modal", async () => {
    initImageSDSInfoPopover();
    attachImageSDSPopoverOutsideClose();
    await openImageSearch();
    ensureImageSearchTagsInput();
    $("#image_search_form").off("submit.imageSearch").on("submit.imageSearch", function (e) {
        e.preventDefault();
    });
    $("#image_search_include_prerelease, #image_search_include_experimental").off("change.imageSearch").on("change.imageSearch", debounce(searchImages, 350));
    $("#image_search_sort_btn").off("click.imageSearch").on("click.imageSearch", () => {
        imageSearchSortDescending = !imageSearchSortDescending;
        searchImages();
    });
});

$("#image_modal").on("hidden.bs.modal", () => {
    disposeImageSDSInfoPopover();
});