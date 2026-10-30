onRecordCreateRequest(e => { require(`${__hooks}/project_access.js`).validateMember(e); e.next(); }, "members");
onRecordUpdateRequest(e => { require(`${__hooks}/project_access.js`).validateMember(e); e.next(); }, "members");
onRecordCreateRequest(e => { require(`${__hooks}/project_access.js`).validateRecord(e, true); e.next(); }, "records");
onRecordUpdateRequest(e => { require(`${__hooks}/project_access.js`).validateRecord(e, false); e.next(); }, "records");
