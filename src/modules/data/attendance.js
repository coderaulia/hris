import {
    state,
    emit,
    generateUuid,
    isMissingRelationError,
    debugError,
    asArray,
    toNumber,
} from './runtime.js';
import { backend } from '../../lib/backend.js';
import { logActivity } from './activity.js';

const VALID_EVENT_TYPES = new Set(['clock_in', 'clock_out']);
const EARTH_RADIUS_M = 6371000;

function currentEmployeeId() {
    return String(state.currentUser?.id || '').trim();
}

function toRadians(deg) {
    return (toNumber(deg, 0) * Math.PI) / 180;
}

// Great-circle distance in metres between two coordinates.
function haversineMeters(lat1, lon1, lat2, lon2) {
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Returns the nearest active work site within its radius, or null when none match.
function matchWorkSite(latitude, longitude, sites = []) {
    if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return null;
    let best = null;
    asArray(sites)
        .filter(site => site && site.active !== false)
        .forEach(site => {
            const distance = haversineMeters(latitude, longitude, site.latitude, site.longitude);
            const radius = toNumber(site.radius_m, 150);
            if (distance <= radius && (!best || distance < best.distance)) {
                best = { site, distance };
            }
        });
    return best;
}

async function fetchWorkSites() {
    try {
        const { data, error } = await backend.attendance.listWorkSites();
        if (error) throw error;
        state.attendanceWorkSites = asArray(data);
        emit('data:attendanceWorkSites', state.attendanceWorkSites);
        return state.attendanceWorkSites;
    } catch (error) {
        if (!isMissingRelationError(error)) debugError('Fetch work sites error:', error);
        state.attendanceWorkSites = [];
        emit('data:attendanceWorkSites', state.attendanceWorkSites);
        return [];
    }
}

async function saveWorkSite(site) {
    const payload = {
        name: String(site?.name || '').trim(),
        latitude: toNumber(site?.latitude, NaN),
        longitude: toNumber(site?.longitude, NaN),
        radius_m: Math.max(1, Math.round(toNumber(site?.radius_m, 150))),
        active: site?.active !== false,
        created_by: currentEmployeeId() || null,
        updated_at: new Date().toISOString(),
    };
    if (site?.id) payload.id = site.id;
    if (!payload.name || !Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
        throw new Error('Work site needs a name and valid coordinates');
    }

    const { data, error } = await backend.attendance.upsertWorkSite(payload);
    if (error) throw error;
    await logActivity({
        action: site?.id ? 'update_work_site' : 'create_work_site',
        entityType: 'attendance_work_site',
        entityId: data?.id || site?.id,
        details: { name: payload.name },
    });
    await fetchWorkSites();
    return data;
}

async function removeWorkSite(id) {
    const siteId = String(id || '').trim();
    if (!siteId) return;
    const { error } = await backend.attendance.deleteWorkSite(siteId);
    if (error) throw error;
    await logActivity({
        action: 'delete_work_site',
        entityType: 'attendance_work_site',
        entityId: siteId,
    });
    await fetchWorkSites();
}

async function fetchMyAttendance(range = {}) {
    const employeeId = currentEmployeeId();
    if (!employeeId) {
        state.myAttendance = [];
        emit('data:myAttendance', state.myAttendance);
        return [];
    }
    try {
        const { data, error } = await backend.attendance.listMyAttendance(employeeId, range);
        if (error) throw error;
        state.myAttendance = asArray(data);
        emit('data:myAttendance', state.myAttendance);
        return state.myAttendance;
    } catch (error) {
        if (!isMissingRelationError(error)) debugError('Fetch my attendance error:', error);
        state.myAttendance = [];
        emit('data:myAttendance', state.myAttendance);
        return [];
    }
}

async function fetchAttendance(filters = {}) {
    try {
        const { data, error } = await backend.attendance.listAttendance(filters);
        if (error) throw error;
        state.attendanceRecords = asArray(data);
        emit('data:attendanceRecords', state.attendanceRecords);
        return state.attendanceRecords;
    } catch (error) {
        if (!isMissingRelationError(error)) debugError('Fetch attendance error:', error);
        state.attendanceRecords = [];
        emit('data:attendanceRecords', state.attendanceRecords);
        return [];
    }
}

// Records one immutable clock event with optional geolocation + selfie.
// geo: { latitude, longitude, accuracy, address }; photoBlob: JPEG/PNG Blob.
async function recordClockEvent({ eventType, geo = {}, photoBlob = null, note = '', deviceInfo = null } = {}) {
    const employeeId = currentEmployeeId();
    if (!employeeId) throw new Error('You must be signed in to clock in or out');
    if (!VALID_EVENT_TYPES.has(eventType)) throw new Error('Invalid attendance event type');

    const recordId = generateUuid();
    const eventTime = new Date();
    const latitude = Number.isFinite(Number(geo.latitude)) ? Number(geo.latitude) : null;
    const longitude = Number.isFinite(Number(geo.longitude)) ? Number(geo.longitude) : null;

    const sites = state.attendanceWorkSites?.length ? state.attendanceWorkSites : await fetchWorkSites();
    const matched = latitude !== null && longitude !== null ? matchWorkSite(latitude, longitude, sites) : null;

    const row = {
        id: recordId,
        employee_id: employeeId,
        event_type: eventType,
        event_time: eventTime.toISOString(),
        latitude,
        longitude,
        accuracy_m: Number.isFinite(Number(geo.accuracy)) ? Number(geo.accuracy) : null,
        address: String(geo.address || '').trim() || null,
        work_site_id: matched?.site?.id || null,
        within_geofence: sites.length ? Boolean(matched) : null,
        device_info: deviceInfo || null,
        note: String(note || '').trim() || null,
    };

    let storagePath = null;
    if (photoBlob) {
        const datePart = eventTime.toISOString().slice(0, 10);
        storagePath = `${employeeId}/${datePart}/${recordId}.jpg`;
    }

    const { data, error } = await backend.attendance.recordEvent(row, photoBlob, storagePath);
    if (error) throw error;

    await logActivity({
        action: eventType,
        entityType: 'attendance_record',
        entityId: recordId,
        details: {
            within_geofence: row.within_geofence,
            work_site_id: row.work_site_id,
            has_photo: Boolean(photoBlob),
        },
    });

    const saved = data || { ...row, photo_storage_path: storagePath };
    await fetchMyAttendance();
    return saved;
}

async function correctAttendance(id, patch = {}) {
    const recordId = String(id || '').trim();
    if (!recordId) throw new Error('Attendance record id is required');
    const nextPatch = { ...patch, corrected_by: currentEmployeeId() || null };
    const { data, error } = await backend.attendance.updateRecord(recordId, nextPatch);
    if (error) throw error;
    await logActivity({
        action: 'correct_attendance',
        entityType: 'attendance_record',
        entityId: recordId,
        details: patch,
    });
    return data;
}

async function deleteAttendanceRecord(record) {
    const recordId = String(record?.id || '').trim();
    if (!recordId) return;
    const { error } = await backend.attendance.deleteRecord(recordId, record?.photo_storage_path || null);
    if (error) throw error;
    await logActivity({
        action: 'delete_attendance',
        entityType: 'attendance_record',
        entityId: recordId,
    });
}

async function getAttendancePhotoUrl(record) {
    if (!record?.photo_storage_path) return null;
    const { data, error } = await backend.attendance.getPhotoUrl(record.photo_storage_path);
    if (error) throw error;
    return data?.signedUrl || null;
}

export {
    haversineMeters,
    matchWorkSite,
    fetchWorkSites,
    saveWorkSite,
    removeWorkSite,
    fetchMyAttendance,
    fetchAttendance,
    recordClockEvent,
    correctAttendance,
    deleteAttendanceRecord,
    getAttendancePhotoUrl,
};
