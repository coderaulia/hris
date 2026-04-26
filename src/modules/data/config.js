import { state, emit, debugError } from './runtime.js';
import { backend } from '../../lib/backend.js';

async function fetchConfig() {
    try {
        const { data, error } = await backend.config.listCompetencies();
        if (error) throw error;

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
    const { error } = await backend.config.saveCompetencies(posName, competencies);
    if (error) throw error;
    
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
