const Codelist = require('../models/codelists.model'); // Adjust path as necessary

async function createRolesCodelist() {
    // 1. Define the values you want to insert
    const roleValues = [
        { Id: 1, Code: 'AD', Name: 'Admin' },
        { Id: 2, Code: 'CO', Name: 'Coral' },
        { Id: 3, Code: 'CD', Name: 'Cad' },
        { Id: 4, Code: 'CL', Name: 'Client' }
    ];

    try {
        // 2. Create a new document using the Codelist model
        const newCodelist = new Codelist({
            Type: 'Roles', 
            Values: roleValues 
        });

        // 3. Save the document to MongoDB
        const result = await newCodelist.save();
        console.log("Successfully created Codelist for 'Roles':", result);

    } catch (err) {
        console.error("Error creating Codelist:", err);
    }
}

exports.createRolesCodelist = createRolesCodelist;