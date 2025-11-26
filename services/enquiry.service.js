const repo = require('../repositories/enquiry.repo');
const userService = require("../services/user.service");
const clientService = require("../services/client.service");
const metalPricesService = require("../services/metalPrices.service");
const chatService = require('./chat.service');
const { uploadToS3, generatePresignedUrl } = require('../utils/s3');
const { v4: uuidv4 } = require('uuid');
const xlsx = require('xlsx');
const pushService = require('../services/pushNotification.service');
const codelistsService = require('../services/codelists.service');
const notificationService = require('../services/notifications.service');

// Get all enquiries
exports.getEnquiries = async () => {
    return await repo.getAllEnquiries();
};

// Get a single enquiry by ID
exports.getEnquiry = async (id) => {
    return await repo.getEnquiryById(id);
};

// Get enquiries by client id
exports.getEnquiriesByClientId = async (clientId) => {
    return await repo.getEnquiriesByClientId(clientId);
};

// Get enquiries by user id (from Participants)
exports.getEnquiriesByUserId = async (userId) => {
    return await repo.getEnquiriesByUserId(userId);
};

exports.createEnquiry = async (data, userId) => {
    const { AssignedTo, Status, ...rest } = data;

    const StatusHistory = [
        {
            Status: 'Enquiry Created',
            Timestamp: new Date(),
            AddedBy: userId || 'System'
        }
    ];

    if (AssignedTo || Status !== 'Enquiry Created') {
        StatusHistory.push({
            Status: Status,
            Timestamp: new Date(),
            AssignedTo: AssignedTo || null,
            AddedBy: userId || 'System'
        });
    }

    const enquiryData = {
        ...rest, // Only fields allowed in the schema (e.g., Name, Quantity, etc.)
        StatusHistory
    };

    const enquiry = await repo.createEnquiry(enquiryData);

    const adminRoleId = (await codelistsService.getCodelistByName("Roles"))?.find(role => role.Code === "AD")?.Id;
    const adminIds = await userService.getUsersByRole(adminRoleId);
    const clientIds = await userService.getUsersByClient(enquiry.ClientId);
    const designerId = AssignedTo || null;

    await chatService.createChat(enquiry._id, enquiry.Name, 'admin-client', [...adminIds, ...clientIds]);
    await chatService.createChat(enquiry._id, enquiry.Name, 'admin-designer', designerId ? [...adminIds, designerId] : [...adminIds]);

    // 5️⃣ 🔔 Send notifications
    try {
        // Admin notifications
        await notificationService.createAlertsForUsers(
            adminIds, // 1. The array of user IDs
            '🆕 New Enquiry Created', // 2. The title
            `New enquiry "${enquiry.Name}" has been created.`, // 3. The body
            'enquiry_created', // 4. The type
            // `/enquiries/${enquiry._id.toString()}` // 5. The in-app link
            `singleEnquiry` // 5. The in-app link TODO change to proper link
        );

        // Designer notification (if assigned)
        if (designerId) {
            await notificationService.createAlertsForUsers(
                [designerId], // 1. The userId (as an array)
                '🎨 New Enquiry Assigned', // 2. The title
                `You've been assigned enquiry "${enquiry.Name}".`, // 3. The body
                'enquiry_assigned', // 4. The type
                // `/enquiries/${enquiry._id.toString()}` // 5. The in-app link
                `singleEnquiry` // 5. The in-app link TODO change to proper link
            );
        }

        console.log(
            `📲 Sent enquiry creation notifications: ${adminIds.length} admins, ${designerId ? 1 : 0
            } designer`
        );
    } catch (err) {
        console.error('❌ Error sending enquiry creation notifications:', err);
    }

    return enquiry._id;
};

exports.deleteEnquiry = async (id) => {
    try {
        // 1️⃣ Delete the enquiry
        console.log(`Deleting enquiry ${id}...`);
        const deleted = await repo.deleteEnquiry(id);
        if (!deleted) {
            throw new Error('Enquiry not found');
        }

        // 2️⃣ Delete all related messages
        await chatService.deleteChatsByEnquiryId(id);

        // 3️⃣ Return the deleted enquiry
        return deleted;
    } catch (err) {
        throw new Error('Error deleting enquiry: ' + err.message);
    }
};

exports.updateEnquiry = async (id, data, userId) => {
    const enquiry = await repo.getEnquiryById(id);
    if (!enquiry) {
        throw new Error('Enquiry not found');
    }

    const updatableFields = [
        'Name', 'Quantity', 'StyleNumber', 'ClientId',
        'Priority', 'Metal', 'Category', 'StoneType',
        'MetalWeight', 'DiamondWeight', 'Stamping',
        'Remarks', 'ShippingDate'
    ];

    const updatedFields = {};
    const changes = [];

    for (const key of updatableFields) {
        const oldValue = JSON.stringify(enquiry[key]);
        const newValue = JSON.stringify(data[key]);

        if (data.hasOwnProperty(key) && oldValue !== newValue) {
            updatedFields[key] = data[key];
            changes.push(`${key}: from "${oldValue}" to "${newValue}"`);
        }
    }

    let oldStatusHistory = enquiry.StatusHistory.at(-1);
    if (oldStatusHistory.Status != data.Status) {
        changes.push(`Status: from "${oldStatusHistory.Status}" to "${data.Status}"`);
    }
    if (oldStatusHistory.AssignedTo != data.AssignedTo) {
        let oldAssignee = await userService.getUserById(oldStatusHistory.AssignedTo);
        let newAssignee = await userService.getUserById(data.AssignedTo);
        changes.push(`Assigned: from "${oldAssignee?.name}" to "${newAssignee?.name}"`);

        // 🟢 Add new designer to admin-designer chat
        if (newAssignee?._id) {
            await chatService.addParticipantIfMissing(enquiry._id, 'admin-designer', newAssignee._id);

            // 5️⃣ 🔔 Send notification to new assignee
            try {
                await notificationService.createAlertsForUsers(
                    [newAssignee._id], // 1. The userId (as an array)
                    '🎨 New Enquiry Assigned', // 2. The title
                    `You've been assigned to enquiry "${enquiry.Name}".`, // 3. The body
                    'enquiry_assigned', // 4. The type
                    // `/enquiries/${enquiry._id.toString()}` // 5. The in-app link
                    `SingleEnquiry` // 5. The in-app link TODO modify
                );

            } catch (err) {
                // This will now catch errors from the database save (insertMany)
                console.error(
                    `❌ Error creating notification for enquiry ${enquiry._id}:`,
                    err
                );
            }
        }
    }

    // 2️⃣ Client changed
    if (enquiry.ClientId != data.ClientId) {
        const adminRoleId = (await codelistsService.getCodelistByName("Roles"))
            ?.find(role => role.Code === "AD")?.Id;
        const adminIds = await userService.getUsersByRole(adminRoleId);
        const newClientIds = await userService.getUsersByClient(data.ClientId);

        changes.push(`Client changed: from "${enquiry.ClientId}" to "${data.ClientId}"`);

        // 🟢 Replace non-admins in admin-client chat
        await chatService.updateParticipants(enquiry._id, 'admin-client', [...adminIds, ...newClientIds]);
    }

    if (changes.length > 0) {
        const statusEntry = {
            Status: data.Status,
            Timestamp: new Date(),
            AssignedTo: data.AssignedTo,
            AddedBy: userId || 'System',
            Details: changes.join(', ')
        };

        enquiry.StatusHistory.push(statusEntry);
        Object.assign(enquiry, updatedFields);
        await repo.updateEnquiry(id, enquiry);
    }

    return { _id: enquiry._id };
};


exports.handleAssetUpload = async (id, type, files, version, code, userId) => {
    const enquiry = await repo.getEnquiryById(id);
    if (!enquiry) throw new Error('Enquiry not found');

    // 1) perform the upload with the right handler
    let uploadResult;
    switch (type) {
        case 'coral':
            uploadResult = await handleCoralUpload(enquiry, files, version, code, userId);
            break;
        case 'cad':
            uploadResult = await handleCadUpload(enquiry, files, version, code, userId);
            break;
        case 'reference':
            uploadResult = await handleReferenceImageUpload(enquiry, files, userId);
            break;
        default:
            throw new Error('Invalid asset type');
    }

    // 2) Notify admins (push) that an asset was uploaded
    try {
        // get admin role id (same pattern used elsewhere)
        const roles = await codelistsService.getCodelistByName('Roles');
        const adminRoleId = roles?.find((r) => r.Code === 'AD')?.Id;
        if (adminRoleId) {
            // get admin user ids
            let adminIds = await userService.getUsersByRole(adminRoleId); // returns user ids array
            if (adminIds && adminIds.length) {
                // 1. Filter out the uploader
                const adminIdsToNotify = adminIds
                    .map((id) => id.toString())
                    .filter((id) => id !== String(userId));

                if (adminIdsToNotify.length > 0) {
                    // 2. Prepare the notification content
                    const fileCount = Array.isArray(files) ? files.length : 1;
                    const prettyType = type.charAt(0)?.toUpperCase() + type.slice(1);
                    const title = `New ${prettyType} uploaded`;
                    const body = `${fileCount} file${fileCount > 1 ? 's' : ''
                        } uploaded for enquiry "${enquiry.Name || enquiry._id}"${version ? ` (version ${version})` : ''
                        }.`;
                    const link = `/enquiries/${enquiry._id.toString()}`; //TODO change

                    // 3. Call the new service (replaces the entire old block)
                    await notificationService.createAlertsForUsers(
                        adminIdsToNotify,
                        title,
                        body,
                        'asset_upload', // The type
                        link
                    );
                } else {
                    console.log('⚠️ No admins to notify after excluding uploader.');
                }
            }
        } else {
            console.log('⚠️ Admin role id not found, skipping admin notifications.');
        }
    } catch (err) {
        console.error(`❌ Error notifying admins after asset upload for enquiry ${id}:`, err);
        // don't fail the main flow — upload already completed
    }

    // 3) return upload result to caller
    return uploadResult;
};


exports.updateAssetData = async (enquiryId, type, version, data, userId) => {
    const enquiry = await repo.getEnquiryById(enquiryId);
    if (!enquiry) throw new Error('Enquiry not found');
    let statusEntry = null;
    switch (type) {
        case 'coral':
            let coralIndex = enquiry.Coral.findIndex(a => a.Version === version);
            if (coralIndex !== -1) {
                const updatedCoral = enquiry.Coral[coralIndex];

                if (data.IsApprovedVersion !== undefined && data.IsApprovedVersion !== null) {
                    updatedCoral.IsApprovedVersion = data.IsApprovedVersion;
                    if (data.IsApprovedVersion === true) {
                        statusEntry = {
                            Status: 'Approved Cad',
                            Timestamp: new Date(),
                            AssignedTo: null,
                            AddedBy: userId || 'System',
                            Details: "Coral Approved"
                        };
                    }
                    else {
                        updatedCoral.ReasonForRejection = data.ReasonForRejection || "";
                        statusEntry = {
                            Status: 'Enquiry Created',
                            Timestamp: new Date(),
                            AssignedTo: enquiry.StatusHistory?.at(-1)?.AssignedTo,
                            AddedBy: userId || 'System',
                            Details: "Coral Rejected - " + data.ReasonForRejection ?? ""
                        };
                    }
                    enquiry.StatusHistory.push(statusEntry);
                }

                if (data.Pricing !== undefined && data.Pricing !== null) {
                    updatedCoral.Pricing = data.Pricing;
                    statusEntry = {
                        Status: enquiry.StatusHistory?.at(-1)?.Status,
                        Timestamp: new Date(),
                        AssignedTo: enquiry.StatusHistory?.at(-1)?.AssignedTo,
                        AddedBy: userId || 'System',
                        Details: "Coral Pricing Updated"
                    };
                    enquiry.StatusHistory.push(statusEntry);
                }

                if (data.ShowToClient !== undefined && data.ShowToClient !== null) {
                    updatedCoral.ShowToClient = data.ShowToClient;
                    statusEntry = {
                        Status: 'Design Approval Pending',
                        Timestamp: new Date(),
                        AssignedTo: enquiry.StatusHistory?.at(-1)?.AssignedTo,
                        AddedBy: userId || 'System',
                        Details: "Approval pending for coral" ?? ""
                    };
                    enquiry.StatusHistory.push(statusEntry);
                }

                if (data.CoralCode !== undefined && data.CoralCode !== null) {
                    updatedCoral.CoralCode = data.CoralCode;
                }

                if (data.Description && data.Id) {
                    updatedCoral.Images = updatedCoral.Images.map(image => {
                        if (image.Id === data.Id) {
                            return { ...image, Description: data.Description };
                        }
                        return image;
                    });
                }

                if (data.Delete === true) {
                    if (data.Id) {
                        updatedCoral.Images = updatedCoral.Images.filter(image => image.Id !== data.Id);
                    } else {
                        //delete entire version
                        enquiry.Coral.splice(coralIndex, 1);
                        // Move status back to in progress because in 10 mins designer deleted it
                        statusEntry = {
                            Status: 'Coral',
                            Timestamp: new Date(),
                            AssignedTo: enquiry.StatusHistory?.at(-1)?.AssignedTo,
                            AddedBy: userId || 'System',
                            Details: "Coral Version Deleted"
                        };
                        enquiry.StatusHistory.push(statusEntry);
                    }
                }

                // Replace the item at the found index only if not deleting entire version
                if (!(data.Delete === true && !data.Id)) {
                    enquiry.Coral[coralIndex] = updatedCoral;
                }
            }
            else {
                throw new Error('Version not found in Coral');
            }
            break;
        case 'cad':
            let cadIndex = enquiry.Cad.findIndex(a => a.Version === version);
            if (cadIndex !== -1) {
                const updatedCad = enquiry.Cad[cadIndex];

                if (data.IsFinalVersion !== undefined && data.IsFinalVersion !== null) {
                    updatedCad.IsFinalVersion = data.IsFinalVersion;
                    if (data.IsFinalVersion === true) {
                        updatedCad.IsFinalVersion = data.IsFinalVersion;
                        statusEntry = {
                            Status: 'Approved Cad',
                            Timestamp: new Date(),
                            AssignedTo: null,
                            AddedBy: userId || 'System',
                            Details: "Cad Approved"
                        };
                    }
                    else {
                        updatedCad.ReasonForRejection = data.ReasonForRejection || "";
                        statusEntry = {
                            Status: 'Enquiry Created',
                            Timestamp: new Date(),
                            AssignedTo: enquiry.StatusHistory?.at(-1)?.AssignedTo,
                            AddedBy: userId || 'System',
                            Details: "Cad Rejected - " + data.ReasonForRejection ?? ""
                        };
                    }
                    enquiry.StatusHistory.push(statusEntry);
                }

                if (data.Pricing !== undefined && data.Pricing !== null) {
                    updatedCad.Pricing = data.Pricing;
                    statusEntry = {
                        Status: enquiry.StatusHistory?.at(-1)?.Status,
                        Timestamp: new Date(),
                        AssignedTo: enquiry.StatusHistory?.at(-1)?.AssignedTo,
                        AddedBy: userId || 'System',
                        Details: "Cad Pricing Updated"
                    };
                    enquiry.StatusHistory.push(statusEntry);
                }

                if (data.CadCode !== undefined && data.CadCode !== null) {
                    updatedCad.CadCode = data.CadCode;
                }

                if (data.ShowToClient !== undefined && data.ShowToClient !== null) {
                    updatedCad.ShowToClient = data.ShowToClient;
                    statusEntry = {
                        Status: 'Design Approval Pending',
                        Timestamp: new Date(),
                        AssignedTo: enquiry.StatusHistory?.at(-1)?.AssignedTo,
                        AddedBy: userId || 'System',
                        Details: "Approval pending for cad" ?? ""
                    };
                    enquiry.StatusHistory.push(statusEntry);
                }

                if (data.Description && data.Id) {
                    updatedCad.Images = updatedCad.Images.map(image => {
                        if (image.Id === data.Id) {
                            return { ...image, Description: data.Description };
                        }
                        return image;
                    });
                }

                if (data.Delete === true) {
                    if (data.Id) {
                        updatedCad.Images = updatedCad.Images.filter(image => image.Id !== data.Id);
                    } else {
                        //delete entire version
                        enquiry.Cad.splice(cadIndex, 1);
                        statusEntry = {
                            Status: 'CAD',
                            Timestamp: new Date(),
                            AssignedTo: enquiry.StatusHistory?.at(-1)?.AssignedTo,
                            AddedBy: userId || 'System',
                            Details: "Cad Version Deleted"
                        };
                        enquiry.StatusHistory.push(statusEntry);
                    }
                }

                // Replace the item at the found index only if not deleting entire version
                if (!(data.Delete === true && !data.Id)) {
                    enquiry.Cad[cadIndex] = updatedCad;
                }
            }
            else {
                throw new Error('Version not found in Cad');
            }
            break;
        case 'reference':
            if (!enquiry.ReferenceImages) {
                break;
            }
            if (data.Description && data.Id) {
                enquiry.ReferenceImages = enquiry.ReferenceImages.map(image => {
                    if (image.Id === data.Id) {
                        return { ...image, Description: data.Description };
                    }
                    return image;
                });
            }
            break;
        default:
            throw new Error('Invalid asset type');
    }

    // Save the updated enquiry
    return await repo.updateEnquiry(enquiryId, enquiry);
};


async function handleCoralUpload(enquiry, files, version, coralCode, userId) {

    const assetVersion = version || 'Version 1';
    let asset = enquiry.Coral.find(a => a.Version === assetVersion);

    if (!asset) {
        asset = {
            Version: assetVersion,
            Images: [],
            Excel: null,
            Pricing: null,
            CoralCode: coralCode || '',
            IsApprovedVersion: false
        };
    }

    if (files.images) {
        for (const file of files.images) {
            const key = await uploadToS3(file);
            asset.Images.push({
                Id: uuidv4(),
                Key: key,
                Description: file.originalname
            });
        }
    }

    if (files.excel && files.excel.length > 0) {
        const excelFile = files.excel[0];
        const key = await uploadToS3(excelFile);
        asset.Excel = {
            Id: uuidv4(),
            Key: key,
            Description: excelFile.originalname
        };

        let excelTableJson = await handleExcelDataForCoral(files.excel?.[0]);
        if (excelTableJson) {
            excelTableJson.Stones = excelTableJson.Stones.map(stone => ({
                ...stone,
                Type: enquiry.StoneType, // Add StoneType from enquiry
            }));
            excelTableJson.Metal = {
                Weight: excelTableJson.Metal.Weight || null,
                Quality: enquiry.Metal.Quality || null,
            };
            excelTableJson.Quantity = enquiry.Quantity || 1;

            let pricing = await exports.calculatePricing(excelTableJson, enquiry.ClientId);

            let pricingEntry = [{
                MetalPrice: parseFloat(pricing.MetalPrice),
                DiamondsPrice: parseFloat(pricing.DiamondsPrice),
                TotalPrice: parseFloat(pricing.TotalPrice),
                DutiesAmount: parseFloat(pricing.DutiesAmount),
                DiamondWeight: parseFloat(excelTableJson.DiamondWeight),
                TotalPieces: excelTableJson.TotalPieces,
                Loss: pricing.Client.Loss,
                Labour: pricing.Client.Labour,
                ExtraCharges: pricing.Client.ExtraCharges,
                Duties: pricing.Client.Duties,
                Metal: {
                    Weight: pricing.Metal.Weight,
                    Quality: pricing.Metal.Quality,
                    Rate: pricing.Metal.Rate
                },
                Stones: pricing.Stones.map(Stone => ({
                    Type: Stone.Type,
                    Color: Stone.Color,
                    Shape: Stone.Shape,
                    MmSize: Stone.MmSize,
                    SieveSize: Stone.SieveSize,
                    Weight: Stone.Weight,
                    Pcs: Stone.Pcs,
                    CtWeight: Stone.CtWeight,
                    Price: Stone.Price
                }))
            }];

            asset.Pricing = pricingEntry || null;
        }
    }

    // Push to the Coral array
    enquiry.Coral = enquiry.Coral || [];

    // If asset already exists, update it
    const index = enquiry.Coral.findIndex(a => a.Version === assetVersion);
    if (index !== -1) {
        enquiry.Coral[index] = asset; // Update the existing asset
    } else {
        enquiry.Coral.push(asset); // If not found, push the new asset
    }

    // Add a status history entry for Coral upload
    const statusEntry = {
        Status: 'Quotation',
        Timestamp: new Date(),
        AddedBy: userId,
        Details: `Coral Version ${asset.Version} uploaded`
    };

    // Set 'AssignedTo' to the last status history's 'AssignedTo'
    if (enquiry.StatusHistory.length > 0) {
        const lastStatusHistory = enquiry.StatusHistory[enquiry.StatusHistory.length - 1]; // Get the last entry
        statusEntry.AssignedTo = lastStatusHistory.AssignedTo || null;  // If AssignedTo is not set, use null or default value
    }

    enquiry.StatusHistory.push(statusEntry);

    await repo.updateEnquiry(enquiry._id, enquiry);
    return { _id: enquiry._id };
}

async function handleCadUpload(enquiry, files, version, cadCode, userId) {
    const assetVersion = version || 'Version 1';
    let asset = enquiry.Cad.find(a => a.Version === assetVersion);

    if (!asset) {
        asset = {
            Version: assetVersion,
            Images: [],
            Excel: null,
            Pricing: null,
            CadCode: cadCode || '',
            IsFinalVersion: false
        };
    }

    if (files.images) {
        for (const file of files.images) {
            const key = await uploadToS3(file);
            asset.Images.push({
                Id: uuidv4(),
                Key: key,
                Description: file.originalname
            });
        }
    }

    if (files.excel && files.excel.length > 0) {
        const excelFile = files.excel[0];
        const key = await uploadToS3(excelFile);
        asset.Excel = {
            Id: uuidv4(),
            Key: key,
            Description: excelFile.originalname
        };

        let excelTableJson = await handleExcelDataForCad(files.excel[0]);
        if (excelTableJson) {
            excelTableJson.Stones = excelTableJson.Stones.map(stone => ({
                ...stone,
                Type: enquiry.StoneType, // Add StoneType from enquiry
            }));
            excelTableJson.Metal = {
                Weight: excelTableJson.Metal.Weight || null,
                Quality: enquiry.Metal.Quality || null,
            };
            excelTableJson.Quantity = enquiry.Quantity || 1;

            let pricing = await exports.calculatePricing(excelTableJson, enquiry.ClientId);

            let pricingEntry = [{
                MetalPrice: parseFloat(pricing.MetalPrice),
                DiamondsPrice: parseFloat(pricing.DiamondsPrice),
                TotalPrice: parseFloat(pricing.TotalPrice),
                DutiesAmount: parseFloat(pricing.DutiesAmount),
                DiamondWeight: parseFloat(excelTableJson.DiamondWeight),
                TotalPieces: excelTableJson.TotalPieces,
                Loss: pricing.Client.Loss,
                Labour: pricing.Client.Labour,
                ExtraCharges: pricing.Client.ExtraCharges,
                Duties: pricing.Client.Duties,
                Metal: {
                    Weight: pricing.Metal.Weight,
                    Quality: pricing.Metal.Quality,
                    Rate: pricing.Metal.Rate
                },
                Stones: pricing.Stones.map(Stone => ({
                    Type: Stone.Type,
                    Color: Stone.Color,
                    Shape: Stone.Shape,
                    MmSize: Stone.MmSize,
                    SieveSize: Stone.SieveSize,
                    Weight: Stone.Weight,
                    Pcs: Stone.Pcs,
                    CtWeight: Stone.CtWeight,
                    Price: Stone.Price
                }))
            }];

            asset.Pricing = pricingEntry || null;
        }
    }

    // Push to the Cad array
    // If asset already exists, update it
    const index = enquiry.Cad.findIndex(a => a.Version === assetVersion);
    if (index !== -1) {
        enquiry.Cad[index] = asset; // Update the existing asset
    } else {
        enquiry.Cad.push(asset); // If not found, push the new asset
    }

    // Add a status history entry for Cad upload
    const statusEntry = {
        Status: 'Quotation',
        Timestamp: new Date(),
        AddedBy: userId, // User ID from JWT token
        Details: `CAD Version ${asset.Version} uploaded`
    };

    // Set 'AssignedTo' to the last status history's 'AssignedTo'
    if (enquiry.StatusHistory.length > 0) {
        const lastStatusHistory = enquiry.StatusHistory[enquiry.StatusHistory.length - 1]; // Get the last entry
        statusEntry.AssignedTo = lastStatusHistory.AssignedTo || null;  // If AssignedTo is not set, use null or default value
    }

    enquiry.StatusHistory.push(statusEntry);

    await repo.updateEnquiry(enquiry._id, enquiry);
    return { _id: enquiry._id };
}

async function handleReferenceImageUpload(enquiry, files, userId) {

    enquiry.ReferenceImages = enquiry.ReferenceImages || [];

    if (files.images) {
        for (const file of files.images) {
            const key = await uploadToS3(file);
            enquiry.ReferenceImages.push({
                Id: uuidv4(),
                Key: key,
                Description: file.originalname
            });
        }
    }

    // Add a status history entry for Reference Image upload
    const statusEntry = {
        Timestamp: new Date(),
        AddedBy: userId,
        Details: 'Reference images uploaded'
    };

    // Set 'AssignedTo' to the last status history's 'AssignedTo'
    if (enquiry.StatusHistory.length > 0) {
        const lastStatusHistory = enquiry.StatusHistory[enquiry.StatusHistory.length - 1]; // Get the last entry
        statusEntry.AssignedTo = lastStatusHistory.AssignedTo || null;  // If AssignedTo is not set, use null or default value
        statusEntry.Status = lastStatusHistory.Status;
    }

    enquiry.StatusHistory.push(statusEntry);

    await repo.updateEnquiry(enquiry._id, enquiry);
    return { _id: enquiry._id };
}

async function handleExcelDataForCoral(file) {
    if (!file || !file.buffer) {
        return;
    }
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    let stones = [];
    let diamondWeight = null;
    let metalWeight = null;
    let totalPieces = 0;

    for (const row of jsonData) {
        const Color = row['DIA/COL']?.toString()?.trim();
        const Shape = row['ST SHAPE']?.toString()?.trim();
        const MmSize = row['MM SIZE']?.toString()?.trim();
        const SieveSize = row['SIEVE SIZE']?.toString()?.trim();
        const Weight = parseFloat(row['AVRG WT']) || 0;
        const Pcs = parseInt(row['PCS']) || 0;
        const CtWeight = row['CT WT'] ? Math.trunc(parseFloat(row['CT WT']) * 1000) / 1000 : 0;

        // Accumulate total pieces
        totalPieces += Pcs;

        // If it's a valid stone row (with settingType or shape), include it
        if (Shape) {
            stones.push({
                Color,
                Shape,
                MmSize,
                SieveSize,
                Weight,
                Pcs,
                CtWeight
            });
        }

        // Extract goldWeight if present
        if (!metalWeight && row['METAL WEIGHT']) {
            metalWeight = row['METAL WEIGHT'].toString()?.trim();
        }

        // Extract diamondWeight if present (optional)
        if (!diamondWeight && row['T.DIA WT']) {
            diamondWeight = row['T.DIA WT'].toString()?.trim();
        }
    }


    return {
        Stones: stones,
        DiamondWeight: diamondWeight,
        Metal: {
            Weight: metalWeight,
        },
        TotalPieces: totalPieces
    };
}

async function handleExcelDataForCad(file) {
    if (!file || !file.buffer) {
        return;
    }
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    let stones = [];
    let diamondWeight = 0;
    let metalWeight = 0;
    let totalPieces = 0;

    for (const row of jsonData) {
        const Color = row['DIA/COL']?.toString()?.trim();
        const Shape = row['ST SHAPE']?.toString()?.trim() || '';
        const MmSize = row['MM SIZE']?.toString()?.trim();
        const SieveSize = row['SIEVE SIZE']?.toString()?.trim().match(/[\d.]+(?:-[\d.]+)?/)?.[0] || '';
        const Weight = parseFloat(row['AVRG WT']) || 0;
        const Pcs = parseInt(row['PCS']) || 0;
        const CtWeight = row['CT WT'] ? Math.trunc(parseFloat(row['CT WT']) * 1000) / 1000 : 0;

        // Accumulate total pieces
        totalPieces += Pcs;
        
        // Extract goldWeight if present
        if (!metalWeight && row['METAL WEIGHT']) {
            metalWeight = row['METAL WEIGHT'].toString()?.trim();
        }

        // Extract diamondWeight if present (optional)
        if (!diamondWeight && row['T.DIA WT']) {
            diamondWeight = row['T.DIA WT'].toString()?.trim();
        }


        // If it's a valid stone row (with shape), include it
        if (Shape) {
            stones.push({
                Color,
                Shape,
                MmSize,
                SieveSize,
                Weight,
                Pcs,
                CtWeight
            });
        }
    }


    return {
        Stones: stones,
        DiamondWeight: diamondWeight?.toFixed(3),
        Metal: {
            Weight: metalWeight?.toFixed(3),
        },
        TotalPieces: totalPieces
    };
}

exports.searchEnquiries = async (queryParams) => {

    // --- 1. Prepare Pagination ---
    const page = parseInt(queryParams.page, 10) || 1;
    const limit = parseInt(queryParams.limit, 10) || 25;
    const pagination = {
        skip: (page - 1) * limit,
        limit: limit
    };

    // --- 2. Prepare Sorting ---
    const sortBy = queryParams.sortBy || 'AssignedDate'; // Default sort
    const sortOrder = queryParams.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    // --- 3. Extract Search Term ---
    // This is the value from your main search bar
    const searchTerm = queryParams.search || null;

    // --- 4. Extract Filters ---
    // These are all other query params (e.g., status, priority, clientId)
    const reservedKeys = ['page', 'limit', 'sortBy', 'sortOrder', 'search'];
    const filters = {};
    for (const key in queryParams) {
        // If it's not a reserved key and has a value, add it to filters
        if (!reservedKeys.includes(key) && queryParams[key]) {
            filters[key] = queryParams[key];
        }
    }

    // Call the repository with the clearly separated objects
    const result = await repo.search(searchTerm, filters, sort, pagination);

    return {
        ...result,
        page,
        limit
    };
};

exports.getAggregatedCounts = async (queryParams) => {
    // 1. Separate 'groupBy' from the rest of the filters
    const { groupBy, ...filters } = queryParams;

    // 2. Validate groupBy
    if (!groupBy) {
        throw new Error("Missing 'groupBy' query parameter. Try 'status' or 'client'.");
    }
    const allowedTypes = ['status', 'client'];
    if (!allowedTypes.includes(groupBy)) {
        throw new Error("Invalid aggregation type. Must be one of: " + allowedTypes.join(', '));
    }

    // 3. Pass both groupBy and the filters object to the repository
    return await repo.aggregateBy(groupBy, filters);
};

exports.calculatePricing = async (pricingDetails, clientId) => {
    //TODO which metal is it-> take that as parameter
    let loss, labour, extraCharges, duties, metalRate, metalFullRate, stones, metalWeight, metalQuality, metalPrice, quantity, undercutPrice;
    undercutPrice = pricingDetails.UndercutPrice;
    stones = pricingDetails.Stones;
    metalWeight = parseFloat(pricingDetails.Metal.Weight);
    metalQuality = pricingDetails.Metal.Quality;
    quantity = pricingDetails.Quantity || 1;
    let diamondPriceNotFound = false;

    const todaysMetalRates = await metalPricesService.getLatest();

    // Determine metal rate
    if (pricingDetails.Metal.Quality === "Silver 925") {
        metalRate = todaysMetalRates.silver?.price ?? 0;
        metalFullRate = todaysMetalRates.silver?.price ?? 0;
    } else if (pricingDetails.Metal.Quality === "Platinum") {
        metalRate = todaysMetalRates.platinum?.price ?? 0;
        metalFullRate = todaysMetalRates.platinum?.price ?? 0;
    } else {
        const goldRate = todaysMetalRates.gold?.price ?? 0;
        metalFullRate = goldRate;
        const quality = pricingDetails.Metal.Quality?.toUpperCase();
        const match = quality?.match(/^(\d{1,2})K$/);
        if (match) {
            const karat = parseInt(match[1], 10);
            metalRate = (goldRate * karat) / 24;
        } else {
            throw new Error(`Invalid gold quality: ${quality}`);
        }
    }

    if (clientId === null || clientId === undefined || clientId === "") {
        loss = pricingDetails.Loss || 0;
        labour = pricingDetails.Labour || 0;
        extraCharges = pricingDetails.ExtraCharges || 0;
        duties = pricingDetails.Duties || 0;
    }
    else {
        const client = await clientService.getClient(clientId);
        loss = client.Pricing.Loss || 0;
        labour = client.Pricing.Labour || 0;
        extraCharges = client.Pricing.ExtraCharges || 0;
        duties = client.Pricing.Duties || 0;

        // Calculate Diamonds Price
        stones = stones.map(stone => {
            const stoneSize = normalizeMmSize(stone.MmSize);

            const matchingDiamond = client.Pricing.Diamonds.find(diamond =>
                diamond.Type === stone.Type &&
                diamond.Shape === stone.Shape &&
                normalizeMmSize(diamond.MmSize) === stoneSize
            );

            const Price = matchingDiamond ? matchingDiamond.Price ?? 0 : 0;

            return {
                ...stone,
                Price
            };
        });

    }

    // Calculate Diamonds Price
    const { diamondsPrice, diamondWeight } = stones.reduce(
        (acc, stone) => {
            const ratePerCaratOfStone = stone.Price;
            if (ratePerCaratOfStone === undefined || ratePerCaratOfStone === null || ratePerCaratOfStone <= 0) {
                diamondPriceNotFound = true;
            }
            acc.diamondsPrice += parseFloat(stone.CtWeight?.toFixed(3)) * ratePerCaratOfStone;
            acc.diamondWeight += parseFloat(stone.CtWeight?.toFixed(3));
            return acc;
        },
        { diamondsPrice: 0, diamondWeight: 0 }
    );

    // Calculate Metal Price
    const lossFactor = loss / 100;
    metalPrice = parseFloat(metalWeight * ((metalRate * (1 + lossFactor)) + labour)?.toFixed(3));

    let undercutDiamondsPrice = 0;
    if (undercutPrice > 0) {
        undercutDiamondsPrice = stones.reduce((acc, stone) => {
            const ratePerCaratOfStone = stone.Price > undercutPrice ? undercutPrice : stone.Price;
            return acc + (stone.CtWeight * ratePerCaratOfStone);
        }, 0);
    }

    const subtotal = ((metalPrice + (undercutPrice > 0 ? undercutDiamondsPrice : diamondsPrice)) * quantity) + extraCharges;
    let dutiesAmount = subtotal * (duties / 100);

    const totalPrice = ((metalPrice + diamondsPrice) * quantity) + extraCharges + dutiesAmount;

    return {
        MetalPrice: parseFloat(metalPrice?.toFixed(3)),
        DiamondsPrice: diamondPriceNotFound ? 0 : parseFloat(diamondsPrice?.toFixed(3)),
        TotalPrice: parseFloat(totalPrice?.toFixed(3)),
        DutiesAmount: parseFloat(dutiesAmount?.toFixed(3)),
        Metal: {
            Weight: metalWeight,
            Quality: metalQuality,
            Rate: parseFloat(metalFullRate)?.toFixed(3)
        },
        DiamondWeight: parseFloat(diamondWeight?.toFixed(3)),
        TotalPieces: pricingDetails.TotalPieces,
        Client: {
            ExtraCharges: extraCharges,
            Duties: duties,
            Loss: loss,
            Labour: labour
        },
        Stones: stones.map(stone => ({
            Type: stone.Type,
            Color: stone.Color,
            Shape: stone.Shape,
            MmSize: stone.MmSize,
            SieveSize: stone.SieveSize,
            Weight: stone.Weight,
            Price: parseFloat(stone.Price?.toFixed(3)),
            Pcs: stone.Pcs,
            CtWeight: stone.CtWeight
        }))
    };

}

function normalizeMmSize(value) {
    if (!value) return "";

    // Convert to lowercase and trim spaces
    value = value.toLowerCase().trim();

    // Remove all spaces
    value = value.replace(/\s+/g, "");

    // If it's a range "2x3"
    if (value.includes("x")) {
        const parts = value.split("x").map(v => normalizeNumber(v));
        return parts.join("x"); // "2x3"
    }

    // If it's a single number "1.00"
    return normalizeNumber(value);
}

// Normalize a single number
function normalizeNumber(num) {
    const n = parseFloat(num);
    return isNaN(n) ? num : n.toString();  
}


exports.getPresignedUrl = async (key, action) => {
    return await generatePresignedUrl(key, action);
};
