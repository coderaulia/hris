// ==================================================
// LIVE ATTENDANCE — mobile-web clock in/out (records tab view)
// GPS geolocation + selfie capture, plus an HR/superadmin log.
// ==================================================

import { state } from '../lib/store.js';
import { escapeHTML } from '../lib/utils.js';
import * as notify from '../lib/notify.js';
import { exportToExcel } from '../lib/exportUtils.js';
import {
    fetchMyAttendance,
    fetchAttendance,
    recordClockEvent,
    getAttendancePhotoUrl,
} from './data/attendance.js';

const CONTAINER_ID = 'records-attendance';
const MAX_PHOTO_DIM = 1080;
const PHOTO_QUALITY = 0.7;

let handlersBound = false;
let capturedBlob = null;
let capturedUrl = null;
let lastGeo = null;

function isHrView() {
    const role = String(state.currentUser?.role || '').toLowerCase();
    return role === 'superadmin' || role === 'hr';
}

function employeeName(employeeId) {
    return state.db?.[employeeId]?.name || employeeId || '-';
}

function fmtDateTime(value) {
    if (!value) return '-';
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? '-' : dt.toLocaleString();
}

// --- Selfie capture + client-side compression ----------------------------

// Draws an image Blob onto a canvas capped at MAX_PHOTO_DIM and returns a JPEG Blob.
async function compressImage(file) {
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read the selfie file'));
        reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Could not load the selfie image'));
        image.src = dataUrl;
    });

    const scale = Math.min(1, MAX_PHOTO_DIM / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);

    return await new Promise((resolve, reject) => {
        canvas.toBlob(
            blob => (blob ? resolve(blob) : reject(new Error('Could not compress the selfie'))),
            'image/jpeg',
            PHOTO_QUALITY
        );
    });
}

function setCapturedBlob(blob) {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    capturedBlob = blob;
    capturedUrl = blob ? URL.createObjectURL(blob) : null;
    const preview = document.getElementById('att-selfie-preview');
    if (preview) {
        if (capturedUrl) {
            preview.src = capturedUrl;
            preview.classList.remove('d-none');
        } else {
            preview.removeAttribute('src');
            preview.classList.add('d-none');
        }
    }
    updateClockButtons();
}

// --- Geolocation ---------------------------------------------------------

function requestLocation() {
    const statusEl = document.getElementById('att-geo-status');
    if (!('geolocation' in navigator)) {
        lastGeo = null;
        if (statusEl) statusEl.innerHTML = '<span class="text-danger">Location not supported on this device.</span>';
        updateClockButtons();
        return;
    }
    if (statusEl) statusEl.innerHTML = '<span class="text-muted">Getting your location…</span>';
    navigator.geolocation.getCurrentPosition(
        pos => {
            lastGeo = {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
            };
            if (statusEl) {
                statusEl.innerHTML = `<span class="text-success"><i class="bi bi-geo-alt-fill me-1"></i>Location locked</span>
                    <span class="text-muted small">(±${Math.round(lastGeo.accuracy)} m)</span>`;
            }
            updateClockButtons();
        },
        err => {
            lastGeo = null;
            if (statusEl) {
                statusEl.innerHTML = `<span class="text-danger"><i class="bi bi-exclamation-triangle me-1"></i>Location blocked: ${escapeHTML(err.message || 'permission denied')}</span>`;
            }
            updateClockButtons();
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

function updateClockButtons() {
    const ready = Boolean(capturedBlob) && Boolean(lastGeo);
    document.querySelectorAll('.att-clock-btn').forEach(btn => {
        btn.disabled = !ready;
    });
    const hint = document.getElementById('att-clock-hint');
    if (hint) {
        hint.textContent = ready
            ? 'Ready. Choose Clock In or Clock Out.'
            : 'Take a selfie and allow location to enable clock in/out.';
    }
}

// --- Rendering -----------------------------------------------------------

function clockCardHtml() {
    return `
        <div class="card shadow-sm border-0 mb-3">
            <div class="card-header bg-white border-bottom py-2 d-flex justify-content-between align-items-center">
                <h6 class="m-0 fw-bold"><i class="bi bi-camera me-1"></i>Live Attendance</h6>
                <button type="button" id="att-refresh" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-clockwise me-1"></i>Refresh</button>
            </div>
            <div class="card-body">
                <div class="row g-3 align-items-center">
                    <div class="col-12 col-md-auto text-center">
                        <img id="att-selfie-preview" class="rounded border d-none" alt="Selfie preview"
                            style="width:160px;height:160px;object-fit:cover;">
                        <div>
                            <input type="file" id="att-selfie-input" accept="image/*" capture="user" class="d-none">
                            <button type="button" id="att-take-selfie" class="btn btn-sm btn-outline-primary mt-2">
                                <i class="bi bi-camera me-1"></i>Take Selfie
                            </button>
                        </div>
                    </div>
                    <div class="col">
                        <div id="att-geo-status" class="mb-2 small"></div>
                        <button type="button" id="att-refresh-geo" class="btn btn-sm btn-outline-secondary mb-2">
                            <i class="bi bi-geo-alt me-1"></i>Refresh Location
                        </button>
                        <div class="d-flex flex-wrap gap-2">
                            <button type="button" class="btn btn-success att-clock-btn" data-event="clock_in" disabled>
                                <i class="bi bi-box-arrow-in-right me-1"></i>Clock In
                            </button>
                            <button type="button" class="btn btn-danger att-clock-btn" data-event="clock_out" disabled>
                                <i class="bi bi-box-arrow-right me-1"></i>Clock Out
                            </button>
                        </div>
                        <div id="att-clock-hint" class="small text-muted mt-2"></div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card shadow-sm border-0 mb-3">
            <div class="card-header bg-white border-bottom py-2">
                <h6 class="m-0 fw-bold"><i class="bi bi-clock-history me-1"></i>My Recent Punches</h6>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-sm table-hover align-middle mb-0">
                        <thead class="table-light"><tr>
                            <th>When</th><th>Type</th><th class="text-center">Geofence</th><th class="text-end">Selfie</th>
                        </tr></thead>
                        <tbody id="att-my-body"><tr><td colspan="4" class="text-muted small">Loading…</td></tr></tbody>
                    </table>
                </div>
            </div>
        </div>`;
}

function hrLogHtml() {
    return `
        <div class="card shadow-sm border-0">
            <div class="card-header bg-white border-bottom py-2">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <h6 class="m-0 fw-bold"><i class="bi bi-people me-1"></i>Team Attendance Log</h6>
                    <div class="d-flex gap-2 align-items-center flex-wrap">
                        <input type="date" id="att-filter-from" class="form-control form-control-sm" style="max-width:160px;">
                        <input type="date" id="att-filter-to" class="form-control form-control-sm" style="max-width:160px;">
                        <button type="button" id="att-apply-filter" class="btn btn-sm btn-outline-primary"><i class="bi bi-funnel me-1"></i>Apply</button>
                        <button type="button" id="att-export" class="btn btn-sm btn-warning"><i class="bi bi-file-earmark-excel me-1"></i>Export</button>
                    </div>
                </div>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-sm table-hover align-middle mb-0">
                        <thead class="table-light sticky-top"><tr>
                            <th>Employee</th><th>When</th><th>Type</th><th class="text-center">Geofence</th>
                            <th>Coordinates</th><th class="text-end">Selfie</th>
                        </tr></thead>
                        <tbody id="att-log-body"><tr><td colspan="6" class="text-muted small">Loading…</td></tr></tbody>
                    </table>
                </div>
            </div>
        </div>`;
}

function geofenceBadge(within) {
    if (within === true) return '<span class="badge bg-success">Inside</span>';
    if (within === false) return '<span class="badge bg-danger">Outside</span>';
    return '<span class="badge bg-secondary">N/A</span>';
}

function eventBadge(type) {
    return type === 'clock_out'
        ? '<span class="badge bg-danger">Clock Out</span>'
        : '<span class="badge bg-success">Clock In</span>';
}

function selfieCell(record) {
    return record?.photo_storage_path
        ? `<button type="button" class="btn btn-sm btn-link p-0 att-photo-btn" data-path="${escapeHTML(record.photo_storage_path)}">View</button>`
        : '<span class="text-muted small">—</span>';
}

function renderMyTable() {
    const body = document.getElementById('att-my-body');
    if (!body) return;
    const rows = Array.isArray(state.myAttendance) ? state.myAttendance : [];
    if (rows.length === 0) {
        body.innerHTML = '<tr><td colspan="4" class="text-muted small">No punches yet.</td></tr>';
        return;
    }
    body.innerHTML = rows
        .map(
            r => `<tr>
                <td>${escapeHTML(fmtDateTime(r.event_time))}</td>
                <td>${eventBadge(r.event_type)}</td>
                <td class="text-center">${geofenceBadge(r.within_geofence)}</td>
                <td class="text-end">${selfieCell(r)}</td>
            </tr>`
        )
        .join('');
}

function renderLogTable() {
    const body = document.getElementById('att-log-body');
    if (!body) return;
    const rows = Array.isArray(state.attendanceRecords) ? state.attendanceRecords : [];
    if (rows.length === 0) {
        body.innerHTML = '<tr><td colspan="6" class="text-muted small">No attendance records.</td></tr>';
        return;
    }
    body.innerHTML = rows
        .map(r => {
            const coords =
                r.latitude != null && r.longitude != null
                    ? `${Number(r.latitude).toFixed(5)}, ${Number(r.longitude).toFixed(5)}`
                    : '—';
            return `<tr>
                <td>${escapeHTML(employeeName(r.employee_id))}</td>
                <td>${escapeHTML(fmtDateTime(r.event_time))}</td>
                <td>${eventBadge(r.event_type)}</td>
                <td class="text-center">${geofenceBadge(r.within_geofence)}</td>
                <td class="small">${escapeHTML(coords)}</td>
                <td class="text-end">${selfieCell(r)}</td>
            </tr>`;
        })
        .join('');
}

export async function renderAttendanceView() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    container.innerHTML = clockCardHtml() + (isHrView() ? hrLogHtml() : '');
    bindHandlers(container);

    setCapturedBlob(null);
    requestLocation();

    await fetchMyAttendance();
    renderMyTable();

    if (isHrView()) {
        await fetchAttendance();
        renderLogTable();
    }
}

// --- Handlers ------------------------------------------------------------

async function doClock(eventType) {
    if (!capturedBlob) {
        await notify.warn('Please take a selfie first.');
        return;
    }
    if (!lastGeo) {
        await notify.warn('Please allow location access first.');
        return;
    }
    try {
        await notify.withLoading(
            () =>
                recordClockEvent({
                    eventType,
                    geo: lastGeo,
                    photoBlob: capturedBlob,
                    deviceInfo: { userAgent: navigator.userAgent },
                }),
            eventType === 'clock_in' ? 'Clocking In' : 'Clocking Out',
            'Uploading selfie and location…'
        );
        setCapturedBlob(null);
        renderMyTable();
        if (isHrView()) {
            await fetchAttendance();
            renderLogTable();
        }
        await notify.success(eventType === 'clock_in' ? 'Clocked in.' : 'Clocked out.');
    } catch (err) {
        await notify.error(`Could not record attendance: ${err?.message || String(err)}`);
    }
}

async function openPhoto(path) {
    try {
        const url = await getAttendancePhotoUrl({ photo_storage_path: path });
        if (url) window.open(url, '_blank');
        else await notify.warn('Selfie is not available.');
    } catch (err) {
        await notify.error(`Could not open selfie: ${err?.message || String(err)}`);
    }
}

async function exportLog() {
    const rows = Array.isArray(state.attendanceRecords) ? state.attendanceRecords : [];
    if (rows.length === 0) {
        await notify.warn('No attendance records to export.');
        return;
    }
    const data = rows.map(r => ({
        employee_id: r.employee_id,
        employee_name: employeeName(r.employee_id),
        event_type: r.event_type,
        event_time: fmtDateTime(r.event_time),
        within_geofence: r.within_geofence === true ? 'Inside' : r.within_geofence === false ? 'Outside' : 'N/A',
        latitude: r.latitude ?? '',
        longitude: r.longitude ?? '',
        accuracy_m: r.accuracy_m ?? '',
        address: r.address || '',
    }));
    try {
        await exportToExcel(data, `attendance-${new Date().toISOString().slice(0, 10)}`, {
            sheetName: 'Attendance',
        });
    } catch (err) {
        await notify.error(`Export failed: ${err?.message || String(err)}`);
    }
}

function bindHandlers(container) {
    if (handlersBound) return;
    handlersBound = true;

    container.addEventListener('change', async event => {
        const input = event.target.closest('#att-selfie-input');
        if (!input) return;
        const file = input.files && input.files[0];
        if (!file) return;
        try {
            const blob = await compressImage(file);
            setCapturedBlob(blob);
        } catch (err) {
            await notify.error(err?.message || 'Could not process the selfie.');
        } finally {
            input.value = '';
        }
    });

    container.addEventListener('click', async event => {
        if (event.target.closest('#att-take-selfie')) {
            document.getElementById('att-selfie-input')?.click();
            return;
        }
        if (event.target.closest('#att-refresh-geo')) {
            requestLocation();
            return;
        }
        const clockBtn = event.target.closest('.att-clock-btn');
        if (clockBtn) {
            await doClock(clockBtn.dataset.event);
            return;
        }
        const photoBtn = event.target.closest('.att-photo-btn');
        if (photoBtn) {
            await openPhoto(photoBtn.dataset.path);
            return;
        }
        if (event.target.closest('#att-refresh')) {
            await fetchMyAttendance();
            renderMyTable();
            if (isHrView()) {
                await fetchAttendance();
                renderLogTable();
            }
            return;
        }
        if (event.target.closest('#att-apply-filter')) {
            const from = document.getElementById('att-filter-from')?.value || '';
            const to = document.getElementById('att-filter-to')?.value || '';
            const filters = {};
            if (from) filters.from = new Date(`${from}T00:00:00`).toISOString();
            if (to) filters.to = new Date(`${to}T23:59:59`).toISOString();
            await fetchAttendance(filters);
            renderLogTable();
            return;
        }
        if (event.target.closest('#att-export')) {
            await exportLog();
        }
    });
}
