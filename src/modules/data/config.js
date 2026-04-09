import { supabase, state, emit, debugError, execSupabase } from './runtime.js';

async function fetchConfig() {
    try {
        const { data } = await execSupabase(
            'Fetch competency config',
            () => supabase.from('competency_config').select('position_name,competencies'),
            { retries: 1 }
        );

        const config = {};
        (data || []).forEach(row => {
            config[row.position_name] = { competencies: row.competencies || [] };
        });

        state.appConfig = config;
        emit('data:config', config);
        return config;
    } catch (error) {
        debugError('Fetch config error:', error);
        return;
    }
}

async function saveConfig(posName, competencies) {
    await execSupabase(
        `Save competency config "${posName}"`,
        () => supabase
            .from('competency_config')
            .upsert({ position_name: posName, competencies }, { onConflict: 'position_name' }),
        { interactiveRetry: true, retries: 1 }
    );
    state.appConfig[posName] = { competencies };
    emit('data:config', state.appConfig);
}

async function deleteConfig(posName) {
    await execSupabase(
        `Delete competency config "${posName}"`,
        () => supabase
            .from('competency_config')
            .delete()
            .eq('position_name', posName),
        { interactiveRetry: true, retries: 1 }
    );
    delete state.appConfig[posName];
    emit('data:config', state.appConfig);
}

export {
    fetchConfig,
    saveConfig,
    deleteConfig,
};
