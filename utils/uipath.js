const { UiPath } = require('@uipath/uipath-typescript/core');
const { Entities } = require('@uipath/uipath-typescript/entities');
require('dotenv').config();

// 1. Initialize the shared SDK instance
const sdk = new UiPath({
    baseUrl: process.env.UIPATH_BASE_URL,
    orgName: process.env.UIPATH_ORG_NAME,
    tenantName: process.env.UIPATH_TENANT_NAME,
    secret: process.env.UIPATH_TOKEN_SECRET
});

const entitiesService = new Entities(sdk);

/**
 * Shared Helper: Finds an entity by name and returns it with operational methods
 * @param {string} entityName 
 */
async function getEntityInstance(entityName) {
    if (!entityName) throw new Error("Entity name is undefined. Check your .env file.");
    
    const allEntities = await entitiesService.getAll();
    const target = allEntities.find(e => e.name === entityName);
    
    if (!target) throw new Error(`UiPath Entity '${entityName}' not found.`);
    
    // Returns the entity with .getAllRecords(), .insertRecord(), etc.
    return await entitiesService.getById(target.id);
}

module.exports = {
    sdk,
    entitiesService,
    getEntityInstance
};