const fs = require('fs');
const path = require('path');

const ROLE_ASSIGNMENTS_FILE = path.join(__dirname, 'roleAssignments.json');

// Read role assignments from the JSON file
function readRoleAssignments() {
    if (!fs.existsSync(ROLE_ASSIGNMENTS_FILE)) {
        fs.writeFileSync(ROLE_ASSIGNMENTS_FILE, '{}');
    }
    return JSON.parse(fs.readFileSync(ROLE_ASSIGNMENTS_FILE, 'utf8'));
}

// Write role assignments to the JSON file
function writeRoleAssignments(data) {
    fs.writeFileSync(ROLE_ASSIGNMENTS_FILE, JSON.stringify(data, null, 2));
}

// Record role assignment
function recordRoleAssignment(userId, roleId) {
    const data = readRoleAssignments();
    if (!data[userId]) data[userId] = {};
    data[userId][roleId] = Date.now();
    writeRoleAssignments(data);
}

// Get role assignment time
function getRoleAssignmentTime(userId, roleId) {
    const data = readRoleAssignments();
    return data[userId]?.[roleId] || null;
}

module.exports = { recordRoleAssignment, getRoleAssignmentTime };
