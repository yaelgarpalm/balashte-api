/**
 * Parsea una cadena de permisos que puede ser JSON o una lista separada por comas.
 * @param {string|string[]} p Permisos en formato string o array
 * @returns {string[]} Array de permisos
 */
const parsePermisos = (p) => {
    if (!p) return [];
    if (typeof p !== 'string') return p;
    try {
        const parsed = JSON.parse(p);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
        // Si no es JSON válido, asumir lista separada por comas
        return p.split(',').map(s => s.trim()).filter(s => s !== '');
    }
};

module.exports = {
    parsePermisos
};
