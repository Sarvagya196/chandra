const repo = require('../repositories/enquiry.repo');
const userService = require("../services/user.service");
const clientService = require("../services/client.service");
const metalPricesService = require("../services/metalPrices.service");
const { uploadToS3, generatePresignedUrl } = require('../utils/s3');
const { v4: uuidv4 } = require('uuid');
const xlsx = require('xlsx');
const { getIO } = require('../utils/socket');
const pushService = require('../services/pushNotification.service');
const sendMail = require('../utils/email').sendMail;

let frontendUrl = process.env.NODE_ENV === 'production' ? 'https://workflow-ui-virid.vercel.app' : 'http://localhost:4200';

// Get all enquiries
exports.getEnquiries = async () => {
    return await repo.getAllEnquiries();
};

// Get a single enquiry by ID
exports.getEnquiry = async (id) => {
    return await repo.getEnquiryById(id);
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
    if(AssignedTo) {
        // const io = getIO();
        // // TODO add link here to item
        // io.to(`user_${AssignedTo}`).emit('messageNotification', {
        //     type: 'assignment',
        //     message: `You've been assigned enquiry #${enquiry._id}.`,
        //     timestamp: new Date(),
        // });

        // Also send push notification
        this.handleEnquiryParticipants(enquiry._id, AssignedTo, false);
        const subscription = await pushService.getSubscription(AssignedTo);
        if (subscription) {
            try {
                await pushService.sendPush(AssignedTo, {
                    title: `New enquiry assigned`,
                    body: `You've been assigned enquiry #${enquiry._id}.`,
                    url: `${frontendUrl}/enquiries/${enquiry._id}`
                });
            } catch (err) {
                console.error(`Failed to push to user ${AssignedTo}`, err);
            }
        }

        // Also send email notification always
        const assignedUser = await userService.getUserById(AssignedTo);
        if (!assignedUser || !assignedUser.email) {
            console.warn(`No email for user ${AssignedTo}, skipping email notification`);
            return enquiry._id;
        }
        await sendMail(
            assignedUser.email,
            `New enquiry assigned #${enquiry._id}`,
            `
                <p>Hello ${assignedUser.name || ''},</p>
                <p>You have been assigned a new enquiry <b>#${enquiry._id}</b>.</p>
                <p><a href="${frontendUrl}/enquiries/${enquiry._id}">View Enquiry</a></p>
            `,
            `New enquiry assigned #${enquiry._id}`
        );

    }

    return enquiry._id;
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
        'Remarks', 'ShippingDate', 'CoralCode', 'CadCode'
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

        // Notify the new assignee via socket
        // const io = getIO();
        if (newAssignee._id) {
            // TODO
            // io.to(`user_${newAssignee._id}`).emit('messageNotification', {
            //     type: 'Updated',
            //     message: `Enquiry #${id}. has updates. Click to check.`,
            //     timestamp: new Date(),
            // });
            // Also send push notification
            this.handleEnquiryParticipants(enquiry._id, newAssignee._id, false);
            const subscription = await pushService.getSubscription(newAssignee._id);
            if (subscription) {
                try {
                    await pushService.sendPush(newAssignee._id, {
                        title: `Enquiry Updated`,
                        body: `Enquiry #${id}. has updates. Click to check.`,
                        url: `${frontendUrl}/enquiries/${id}`
                    });
                } catch (err) {
                    console.error(`Failed to push to user ${newAssignee._id}`, err);
                }
            }
        }

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

exports.handleAssetUpload = async (id, type, files, version, userId) => {
    const enquiry = await repo.getEnquiryById(id);
    if (!enquiry) throw new Error('Enquiry not found');

    switch (type) {
        case 'coral':
            return await handleCoralUpload(enquiry, files, version, userId);
        case 'cad':
            return await handleCadUpload(enquiry, files, version, userId);
        case 'reference':
            return await handleReferenceImageUpload(enquiry, files, userId);
        default:
            throw new Error('Invalid asset type');
    }
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
                            Status: 'CAD',
                            Timestamp: new Date(),
                            AssignedTo: null,
                            AddedBy: userId || 'System',
                            Details: "Coral Approved"
                        };
                    }
                    else {
                        statusEntry = {
                            Status: 'Coral',
                            Timestamp: new Date(),
                            AssignedTo: enquiry.StatusHistory?.at(-1)?.AssignedTo,
                            AddedBy: userId || 'System',
                            Details: "Coral Rejected - Redo - " + data.ReasonForRejection ?? ""
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

                if(data.Description && data.Id) {
                    updatedCoral.Images = updatedCoral.Images.map(image => {
                        if (image.Id === data.Id) {
                            return { ...image, Description: data.Description };
                        }
                        return image;
                    });
                }
                // Replace the item at the found index
                enquiry.Coral[coralIndex] = updatedCoral;
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
                    if (data.IsFinalVersion === true) {
                        updatedCad.IsFinalVersion = data.IsFinalVersion;
                        statusEntry = {
                            Status: 'Order Placement',
                            Timestamp: new Date(),
                            AssignedTo: null,
                            AddedBy: userId || 'System',
                            Details: "Cad Approved"
                        };
                    }
                    else {
                        statusEntry = {
                            Status: 'CAD',
                            Timestamp: new Date(),
                            AssignedTo: enquiry.StatusHistory?.at(-1)?.AssignedTo,
                            AddedBy: userId || 'System',
                            Details: "Cad Rejected - Redo"
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

                if(data.Description && data.Id) {
                    updatedCad.Images = updatedCad.Images.map(image => {
                        if (image.Id === data.Id) {
                            return { ...image, Description: data.Description };
                        }
                        return image;
                    });
                }

                // Replace the item at the found index
                enquiry.Cad[cadIndex] = updatedCad;
            }
            else {
                throw new Error('Version not found in Cad');
            }
            break;
        case 'reference':
            if (!enquiry.ReferenceImages) {
                break;
            }
            if(data.Description && data.Id) {
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

exports.handleEnquiryParticipants = async (enquiryId, userId, toAdd) => {
    const enquiry = await repo.getEnquiryById(enquiryId);
    if (!enquiry) throw new Error('Enquiry not found');

    if (!Array.isArray(enquiry.Participants)) {
        enquiry.Participants = [];
    }

    if (toAdd) {
        // Add or update participant with active = true
        const existing = enquiry.Participants.find(p => p.UserId === userId);
        if (existing) {
            existing.IsActive = true;
        } else {
            enquiry.Participants.push({ UserId: userId, IsActive: true });
        }
    } else {
        // Instead of removing, just mark active = false
        const existing = enquiry.Participants.find(p => p.UserId === userId);
        if (existing) {
            existing.IsActive = false;
        } else {
            // optional: if not found, still add as inactive
            enquiry.Participants.push({ UserId: userId, IsActive: false });
        }
    }

    await repo.updateEnquiry(enquiryId, enquiry);
};

exports.getEnquiryParticipants = async (enquiryId) => {
    const enquiry = await repo.getEnquiryById(enquiryId);
    if (!enquiry) throw new Error('Enquiry not found');
    return enquiry.Participants || [];
}


async function handleCoralUpload(enquiry, files, version, userId) {

    const assetVersion = version || 'Version 1';
    let asset = enquiry.Coral.find(a => a.Version === assetVersion);

    if (!asset) {
        asset = {
            Version: assetVersion,
            Images: [],
            Excel: null,
            Pricing: null,
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
    }

    let excelTableJson = await handleExcelData(files.excel?.[0]);
    if (excelTableJson) {
        excelTableJson.Stones = excelTableJson.Stones.map(stone => ({
            ...stone,
            Type: enquiry.StoneType, // Add StoneType from enquiry
        }));
        excelTableJson.Metal = {
            Weight: excelTableJson.Metal.Weight || null,
            Quality: enquiry.Metal.Quality || null,
            Color: enquiry.Metal.Color || null
        };
        excelTableJson.Quantity = enquiry.Quantity || 1;

        let pricing = await exports.calculatePricing(excelTableJson, enquiry.ClientId);

        let pricingEntry = {
            MetalPrice: pricing.MetalPrice,
            DiamondsPrice: pricing.DiamondsPrice,
            TotalPrice: pricing.TotalPrice,
            DiamondWeight: parseFloat(excelTableJson.DiamondWeight),
            TotalPieces: excelTableJson.TotalPieces,
            Loss: pricing.Client.Loss,
            Labour: pricing.Client.Labour,
            ExtraCharges: pricing.Client.ExtraCharges,
            Duties: pricing.Client.Duties,
            Metal: {
                Weight: pricing.Metal.Weight,
                Quality: pricing.Metal.Quality,
                Color: pricing.Metal.Color
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
        };

        asset.Pricing = pricingEntry || null;
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
        Status: 'Design Approval Pending',
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

async function handleCadUpload(enquiry, files, version, userId) {
    const assetVersion = version || 'Version 1';
    let asset = enquiry.Cad.find(a => a.Version === assetVersion);

    if (!asset) {
        asset = {
            Version: assetVersion,
            Images: [],
            Excel: null,
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
    }

    let excelTableJson = await handleExcelData(files.excel[0]);
    if (excelTableJson) {
        excelTableJson.Stones = excelTableJson.Stones.map(stone => ({
            ...stone,
            Type: enquiry.StoneType, // Add StoneType from enquiry
        }));
        excelTableJson.Metal = {
            Weight: excelTableJson.Metal.Weight || null,
            Quality: enquiry.Metal.Quality || null,
            Color: enquiry.Metal.Color || null
        };
        excelTableJson.Quantity = enquiry.Quantity || 1;

        let pricing = await exports.calculatePricing(excelTableJson, enquiry.ClientId);

        let pricingEntry = {
            MetalPrice: pricing.MetalPrice,
            DiamondsPrice: pricing.DiamondsPrice,
            TotalPrice: pricing.TotalPrice,
            DiamondWeight: parseFloat(excelTableJson.DiamondWeight),
            TotalPieces: excelTableJson.TotalPieces,
            Loss: pricing.Client.Loss,
            Labour: pricing.Client.Labour,
            ExtraCharges: pricing.Client.ExtraCharges,
            Duties: pricing.Client.Duties,
            Metal: {
                Weight: pricing.Metal.Weight,
                Quality: pricing.Metal.Quality,
                Color: pricing.Metal.Color
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
        };

        asset.Pricing = pricingEntry || null;
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
        Status: 'Design Approval Pending',
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


async function handleExcelData(file) {
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

    let index = 0;
    for (const row of jsonData) {
        index++;
        const Color = row['DIA/COL']?.toString().trim();
        const Shape = row['ST SHAPE']?.toString().trim();
        const MmSize = parseFloat(row['MM SIZE']) || 0;
        const SieveSize = row['SIEVE SIZE']?.toString().trim();
        const Weight = parseFloat(row['AVRG WT']) || 0;
        const Pcs = parseInt(row['PCS']) || 0;
        const CtWeight = parseFloat(row['CT WT']) || 0;

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
            metalWeight = row['METAL WEIGHT'].toString().trim();
        }

        // Extract diamondWeight if present (optional)
        if (!diamondWeight && row['T.DIA WT']) {
            diamondWeight = row['T.DIA WT'].toString().trim();
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

exports.calculatePricing = async (pricingDetails, clientId) => {
    //TODO which metal is it-> take that as parameter
    let loss, labour, extraCharges, duties, metalRate, stones, metalWeight, metalQuality, metalColor, metalPrice, quantity, undercutPrice;
    undercutPrice = pricingDetails.UndercutPrice;
    stones = pricingDetails.Stones;
    metalWeight = parseFloat(pricingDetails.Metal.Weight);
    metalQuality = pricingDetails.Metal.Quality;
    metalColor = pricingDetails.Metal.Color;
    quantity = pricingDetails.Quantity || 1;
    let diamondPriceNotFound = false;

    const todaysMetalRates = await metalPricesService.getLatest();

    // Determine metal rate
    if (pricingDetails.Metal.Quality === "Silver") {
        metalRate = todaysMetalRates.silver.price;
    } else if (pricingDetails.Metal.Quality === "Platinum") {
        metalRate = todaysMetalRates.platinum.price;
    } else {
        const goldRate = todaysMetalRates.gold.price;
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
            const matchingDiamond = client.Pricing.Diamonds.find(diamond =>
                diamond.Type === stone.Type &&
                diamond.Shape === stone.Shape &&
                Number(diamond.MmSize) === Number(stone.MmSize)
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
            acc.diamondsPrice += stone.CtWeight * ratePerCaratOfStone;
            acc.diamondWeight += stone.CtWeight;
            return acc;
        },
        { diamondsPrice: 0, diamondWeight: 0 }
    );

    // Calculate Metal Price
    const lossFactor = loss / 100;
    metalPrice = metalWeight * ((metalRate * (1 + lossFactor)) + labour);

    let undercutDiamondsPrice = 0;
    if(undercutPrice) {
        undercutDiamondsPrice = stones.reduce((acc, stone) => {
            const ratePerCaratOfStone = stone.Price;
            acc + ratePerCaratOfStone > 210 ? 210 : (stone.CtWeight * ratePerCaratOfStone);
            return acc;
        }, 0);
    }
    const subtotal = ((metalPrice + (undercutPrice ? undercutDiamondsPrice : diamondsPrice)) * quantity) + extraCharges;
    let dutiesAmount = subtotal * (duties / 100);

    const totalPrice = subtotal + dutiesAmount;
    return {
        MetalPrice: parseFloat(metalPrice.toFixed(2)),
        DiamondsPrice: diamondPriceNotFound ? 0 : parseFloat(diamondsPrice.toFixed(2)),
        TotalPrice: parseFloat(totalPrice.toFixed(2)),
        Metal: {
            Weight: metalWeight,
            Quality: metalQuality,
            Color: metalColor
        },
        DiamondWeight: diamondWeight,
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
            Price: parseFloat(stone.Price.toFixed(3)),
            Pcs: stone.Pcs,
            CtWeight: stone.CtWeight
        }))
    };

}


exports.getPresignedUrl = async (key, action) => {
    return await generatePresignedUrl(key, action);
};