import { state } from './store.js';

function getManagerScopeIds(db, managerId) {
    const mgrRec = db[managerId];
    if (!mgrRec) return [];
    if (mgrRec.department) {
        return Object.keys(db).filter(id => db[id].department === mgrRec.department);
    }
    return Object.keys(db).filter(id => db[id].manager_id === managerId || id === managerId);
}

export function getDirectorOperationalScopeIds(db = state.db, directorId = state.currentUser?.id) {
    if (!directorId || !db) return [];

    const directReports = Object.keys(db).filter(id => String(db[id]?.manager_id || '') === String(directorId));
    const scopedPositions = new Set(
        directReports
            .map(id => String(db[id]?.position || '').trim())
            .filter(Boolean)
    );

    const scoped = new Set(directReports);
    if (scopedPositions.size > 0) {
        Object.entries(db).forEach(([id, rec]) => {
            const pos = String(rec?.position || '').trim();
            if (pos && scopedPositions.has(pos)) scoped.add(id);
        });
    }

    scoped.delete(String(directorId));
    return [...scoped];
}

export function getRoleScopedEmployeeIds() {
    const { db, currentUser } = state;
    if (!currentUser) return [];

    if (currentUser.role === 'employee') return [currentUser.id];
    if (currentUser.role === 'manager') {
        return getManagerScopeIds(db, currentUser.id);
    }
    if (currentUser.role === 'director') {
        // Director can monitor full-company dashboard/report aggregates.
        return Object.keys(db);
    }
    return Object.keys(db);
}

export function getFilteredEmployeeIds() {
    const { db, reportFilters } = state;
    let ids = getRoleScopedEmployeeIds();

    if (reportFilters.department) {
        ids = ids.filter(id => (db[id]?.department || '') === reportFilters.department);
    }
    if (reportFilters.manager_id) {
        ids = ids.filter(id => (db[id]?.manager_id || '') === reportFilters.manager_id || id === reportFilters.manager_id);
    }

    return ids;
}
