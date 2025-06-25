const repo = require('../repositories/enquiry.repo');
const userService = require("../services/user.service");
const clientService = require("../services/client.service");
const metalPricesService = require("../services/metalPrices.service");
const { uploadToS3, generatePresignedUrl } = require('../utils/s3');
const { v4: uuidv4 } = require('uuid');
const xlsx = require('xlsx');


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

    if (AssignedTo || Status) {
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
        'Remarks', 'ShippingDate'
    ];

    const updatedFields = {};
    const changes = [];

    for (const key of updatableFields) {
        const oldValue = JSON.stringify(enquiry[key]);
        const newValue = JSON.stringify(data[key]);

        if (data.hasOwnProperty(key) && oldValue !== newValue) {
            updatedFields[key] = data[key];
            changes.push(`${key}: from "${enquiry[key]}" to "${data[key]}"`);
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
                    if(data.IsApprovedVersion === true) {
                        updatedCoral.IsApprovedVersion = data.IsApprovedVersion;
                        statusEntry = {
                            Status: 'CAD Pending',
                            Timestamp: new Date(),
                            AssignedTo: null,
                            AddedBy: userId || 'System',
                            Details: "Coral Approved"
                        };
                    }
                    else {
                        statusEntry = {
                            Status: 'Coral Pending',
                            Timestamp: new Date(),
                            AssignedTo: null,
                            AddedBy: userId || 'System',
                            Details: "Coral Rejected - Redo"
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
                    if(data.IsFinalVersion === true) {
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
                            Status: 'CAD Pending',
                            Timestamp: new Date(),
                            AssignedTo: null,
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

                // Replace the item at the found index
                enquiry.Cad[cadIndex] = updatedCad;
            }
            else {
                throw new Error('Version not found in Cad');
            }
            break;
        default:
            throw new Error('Invalid asset type');
    }

    // Save the updated enquiry
  return await repo.updateEnquiry(enquiryId, enquiry);
};


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

    let excelTableJson = await handleExcelData(files.excel[0]);
    excelTableJson.Stones = excelTableJson.Stones.map(stone => ({
        ...stone,
        Type: enquiry.StoneType, // Add StoneType from enquiry
    }));
    excelTableJson.Metal = {
        Weight: excelTableJson.Metal.Weight || null,
        Quality: enquiry.Metal.Quality || null,
        Type: enquiry.Metal.Type || null
    };

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
            Type: pricing.Metal.Type
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
        Status: 'Approval Pending',
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
    excelTableJson.Stones = excelTableJson.Stones.map(stone => ({
        ...stone,
        Type: enquiry.StoneType, // Add StoneType from enquiry
    }));
    excelTableJson.Metal = {
        Weight: excelTableJson.Metal.Weight || null,
        Quality: enquiry.Metal.Quality || null,
        Type: enquiry.Metal.Type || null
    };

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
            Type: pricing.Metal.Type
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
        Status: 'CAD Approval Pending',
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
        const Shape = row['ST Shape']?.toString().trim();
        const MmSize = parseFloat(row['MM Size']) || 0;
        const SieveSize = row['Sieve Size']?.toString().trim();
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
        if (!metalWeight && row['Metal Weight']) {
            metalWeight = row['Metal Weight'].toString().trim();
        }

        // Extract diamondWeight if present (optional)
        if (!diamondWeight && row['t.dIA wt']) {
            diamondWeight = row['t.dIA wt'].toString().trim();
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
    let loss, labour, extraCharges, duties, metalRate, stones, metalWeight, metalQuality, metalType, metalPrice;
    stones = pricingDetails.Stones;
    metalWeight = parseFloat(pricingDetails.Metal.Weight);
    metalQuality = pricingDetails.Metal.Quality;
    metalType = pricingDetails.Metal.Type;
    
    const todaysMetalRates = await metalPricesService.getLatest();

    // Determine metal rate
    if (pricingDetails.Metal.Type === "Silver") {
      metalRate = todaysMetalRates.silver.price;
    } else if (pricingDetails.Metal.Type === "Platinum") {
      metalRate = todaysMetalRates.platinum.price;
    } else {
        const goldRate = todaysMetalRates.gold.price;
      if (pricingDetails.Metal.Quality === "14K") {
        metalRate = (goldRate * 14) / 24; // 14K Gold
      } else if (pricingDetails.Metal.Quality === "18K") {
        metalRate = (goldRate * 18) / 24; // 18K Gold
      } else if (pricingDetails.Metal.Quality === "22K") {
        metalRate = (goldRate * 22) / 24; // 22K Gold
      } else if (pricingDetails.Metal.Quality === "24K") {
        metalRate = goldRate; // 24K Gold
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
                diamond.SieveSize === stone.SieveSize &&
                diamond.Shape === stone.Shape &&
                Number(diamond.MmSize) === Number(stone.MmSize) &&
                Number(diamond.Carat) == Number(stone.Weight)
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
            const ratePerStone = stone.Price;
            acc.diamondsPrice += stone.Pcs * ratePerStone;
            acc.diamondWeight += stone.CtWeight;
            return acc;
        },
        { diamondsPrice: 0, diamondWeight: 0 }
    );

    // Calculate Metal Price
    const lossFactor = loss / 100;
    metalPrice = metalWeight * ((metalRate * (1 + lossFactor)) + labour);

    const subtotal = metalPrice + diamondsPrice + extraCharges;
    const dutiesAmount = subtotal * (duties / 100);
    const totalPrice = subtotal + dutiesAmount;
    return {
        MetalPrice: parseFloat(metalPrice.toFixed(2)),
        DiamondsPrice: parseFloat(diamondsPrice.toFixed(2)),
        TotalPrice: parseFloat(totalPrice.toFixed(2)),
        Metal: {
            Weight: metalWeight,
            Quality: metalQuality,
            Type: metalType
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