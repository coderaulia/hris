import { invokeEdgeFunction } from './core.js';

export async function createManagedUser({ employeeId, email, password, mustChangePassword = true }) {
    return invokeEdgeFunction('admin-user-mutations', {
        action: 'create_managed_user',
        employee_id: employeeId,
        email,
        password,
        must_change_password: mustChangePassword,
    });
}

export async function updateManagedEmployeeRole({ employeeId, role }) {
    return invokeEdgeFunction('admin-user-mutations', {
        action: 'update_employee_role',
        employee_id: employeeId,
        role,
    });
}
