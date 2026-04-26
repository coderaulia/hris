import {
    state,
    emit,
    debugError,
    writeSettingsCache,
    readSettingsCache,
} from './runtime.js';
import { backend } from '../../lib/backend.js';

async function fetchSettings() {
    try {
        const { data, error } = await backend.settings.list();
        if (error) throw error;

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
    const { error } = await backend.settings.update(key, value);
    if (error) throw error;
    
    state.appSettings[key] = value;
    writeSettingsCache(state.appSettings);
    emit('data:settings', state.appSettings);
}

export {
    fetchSettings,
    saveSetting,
};
