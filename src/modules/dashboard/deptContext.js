const deptKpiContext = {
    name: '',
    month: '',
};

function getDeptKpiContext() {
    return {
        ...deptKpiContext,
    };
}

function setDeptKpiContext(partial = {}) {
    Object.assign(deptKpiContext, partial);
    return getDeptKpiContext();
}

export {
    getDeptKpiContext,
    setDeptKpiContext,
};
