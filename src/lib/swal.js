let swalPromise = null;

export async function getSwal() {
    if (!swalPromise) {
        swalPromise = Promise.all([
            import('sweetalert2'),
            import('sweetalert2/dist/sweetalert2.min.css'),
        ]).then(([mod]) => mod.default);
    }
    return swalPromise;
}
