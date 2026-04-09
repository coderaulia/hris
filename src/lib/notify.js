import { getSwal } from './swal.js';

const defaults = {
    confirmButtonText: 'OK',
    heightAuto: false,
    allowOutsideClick: true,
    allowEscapeKey: true,
};

function fire(options = {}) {
    return getSwal().then(Swal => Swal.fire({ ...defaults, ...options }));
}

let toastPromise = null;

async function getToast() {
    if (!toastPromise) {
        toastPromise = getSwal().then(Swal => Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2800,
            timerProgressBar: true,
            heightAuto: false,
        }));
    }
    return toastPromise;
}

export async function success(message, title = 'Success') {
    const toast = await getToast();
    toast.fire({ icon: 'success', title, text: message });
    return true;
}

export async function info(message, title = 'Information') {
    const toast = await getToast();
    toast.fire({ icon: 'info', title, text: message });
    return true;
}

export async function warn(message, title = 'Warning') {
    const toast = await getToast();
    toast.fire({ icon: 'warning', title, text: message });
    return true;
}

export async function error(message, title = 'Error') {
    const toast = await getToast();
    toast.fire({ icon: 'error', title, text: message, timer: 4500 });
    return true;
}

export async function confirm(message, options = {}) {
    const result = await fire({
        icon: options.icon || 'warning',
        title: options.title || 'Please Confirm',
        text: options.html ? undefined : message,
        html: options.html || undefined,
        showCancelButton: true,
        confirmButtonText: options.confirmButtonText || 'Yes',
        cancelButtonText: options.cancelButtonText || 'Cancel',
        reverseButtons: true,
        focusCancel: true,
    });
    return result.isConfirmed;
}

export async function input(options = {}) {
    const result = await fire({
        title: options.title || 'Input Required',
        text: options.text || '',
        input: options.input || 'text',
        inputOptions: options.inputOptions,
        inputValue: options.inputValue ?? '',
        inputPlaceholder: options.inputPlaceholder || '',
        inputLabel: options.inputLabel || '',
        inputAttributes: options.inputAttributes || {},
        showCancelButton: true,
        confirmButtonText: options.confirmButtonText || 'Save',
        cancelButtonText: options.cancelButtonText || 'Cancel',
        showLoaderOnConfirm: Boolean(options.showLoaderOnConfirm),
        preConfirm: async value => {
            if (typeof options.validate === 'function') {
                const msg = options.validate(value);
                if (msg) {
                    const Swal = await getSwal();
                    Swal.showValidationMessage(msg);
                    return false;
                }
            }
            return value;
        },
    });

    if (!result.isConfirmed) return null;
    return result.value;
}

export async function showLoading(title = 'Please wait...', text = 'Processing request...') {
    const Swal = await getSwal();
    Swal.fire({
        title,
        text,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
            Swal.showLoading();
        },
    });
}

export async function hideLoading() {
    const Swal = await getSwal();
    Swal.close();
}

export async function withLoading(task, title = 'Please wait...', text = 'Processing request...') {
    await showLoading(title, text);
    try {
        return await task();
    } finally {
        await hideLoading();
    }
}
