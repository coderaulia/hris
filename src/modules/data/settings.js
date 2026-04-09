import {
    supabase,
    state,
    emit,
    debugError,
    execSupabase,
    writeSettingsCache,
    readSettingsCache,
} from './runtime.js';

async function fetchSettings() {
    try {
        const { data } = await execSupabase(
            'Fetch settings',
            () => supabase.from('app_settings').select('key,value'),
            { retries: 1 }
        );

        const settings = {};
        (data || []).forEach(row => {
            settings[row.key] = row.value;
        });
        state.appSettings = settings;
        writeSettingsCache(settings);
        emit('data:settings', settings);
        return settings;
    } catch (error) {
        debugError('Fetch settings error:', error);
        const cachedSettings = readSettingsCache();
        state.appSettings = cachedSettings;
        emit('data:settings', cachedSettings);
        return cachedSettings;
    }
}

async function saveSetting(key, value) {
    await execSupabase(
        `Save setting "${key}"`,
        () => supabase
            .from('app_settings')
            .upsert({ key, value }, { onConflict: 'key' }),
        { interactiveRetry: true, retries: 1 }
    );
    state.appSettings[key] = value;
    writeSettingsCache(state.appSettings);
    emit('data:settings', state.appSettings);
}

export {
    fetchSettings,
    saveSetting,
};
