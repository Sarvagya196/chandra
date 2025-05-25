const repo = require('../repositories/enquiry.repo');
const userService = require("../services/user.service");
const clientService = require("../services/client.service");
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
                            Status: 'Cad Pending',
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
                    console.log("Pricing in update function: ", data.Pricing);
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
                console.log("Updated Coral: ", updatedCoral);
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
                            Status: 'Cad Pending',
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
    excelTableJson.stones = excelTableJson.stones.map(stone => ({
        ...stone,
        type: enquiry.StoneType, // Add StoneType from enquiry
    }));
    console.log("Excel Table JSON: ", excelTableJson);
    let pricing = await handleClientWisePricing(excelTableJson, enquiry);
    console.log("Pricing in main function: ", pricing);

    let pricingEntry = {
        MetalPrice: pricing.MetalPrice,
        DiamondsPrice: pricing.DiamondsPrice,
        TotalPrice: pricing.TotalPrice,
        MetalWeight: excelTableJson.metalWeight,
        DiamondWeight: parseFloat(excelTableJson.diamondWeight),
        TotalPieces: excelTableJson.totalPieces,
        Metal: {
            Loss: pricing.Loss,
            Labour: pricing.Labour,
        },
        Stones: pricing.Stones.map(Stone => ({
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
    enquiry.Coral.push(asset);

    // Add a status history entry for Coral upload
    const statusEntry = {
        Status: 'Approval Pending',
        Timestamp: new Date(),
        AddedBy: userId, // User ID from JWT token
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

    let excelTableJson = this.handleExcelData(files.excel[0]);
    let pricing = this.handlePricing(excelTableJson, enquiry.ClientId);

    let pricingEntry = {
        MetalPrice: pricing.MetalPrice,
        DiamondsPrice: pricing.DiamondsPrice,
        TotalPrice: pricing.TotalPrice,
        MetalWeight: excelTableJson.metalWeight,
        DiamondWeight: parseFloat(excelTableJson.diamondWeight),
        TotalPieces: excelTableJson.totalPieces,
        Metal: {
            Loss: pricing.Loss,
            Labour: pricing.Labour,
        },
        Stones: pricing.Stones.map(stone => ({
            Color: stone.Color,
            Shape: stone.Shape,
            MmSize: stone.MmSize,
            SieveSize: stone.SieveSize,
            Weight: stone.Weight,
            Pcs: stone.Pcs,
            CtWeight: stone.CtWeight,
            Price: stone.Price
        }))
    };

    asset.Pricing = pricingEntry || null;

    // Push to the Cad array
    enquiry.Cad = enquiry.Cad || [];
    enquiry.Cad.push(asset);

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
        const color = row['DIA/COL']?.toString().trim();
        const shape = row['ST Shape']?.toString().trim();
        const mmSize = row['MM Size']?.toString().trim();
        const sieveSize = row['Sieve Size']?.toString().trim();
        const weight = parseFloat(row['AVRG WT']) || 0;
        const pcs = parseInt(row['PCS']) || 0;
        const ctWeight = parseFloat(row['CT WT']) || 0;

        // Accumulate total pieces
        totalPieces += pcs;

        // If it's a valid stone row (with settingType or shape), include it
        if (shape) {
            stones.push({
                color,
                shape,
                mmSize,
                sieveSize,
                weight,
                pcs,
                ctWeight
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

    // console.log("Stones: ", stones);
    // console.log("Diamond Weight: ", diamondWeight);
    // console.log("Gold Weight: ", goldWeight);
    // console.log("Total Pieces: ", totalPieces);

    return {
        stones,
        diamondWeight,
        metalWeight,
        totalPieces
    };
}

async function handleClientWisePricing(excelTable, enquiry) {
    const client = await clientService.getClient(enquiry.ClientId);
    console.log("Client: ", client);

    let metalRate = 104; //TODO get current metal rate
    let loss = client.Pricing.Loss || 0;
    let labour = client.Pricing.Labour || 0;
    let extraCharges = client.Pricing.ExtraCharges || 0;
    let duties = client.Pricing.Duties || 0;

    // Determine metal rate
    // if (enquiry.Metal.Type === "Silver") {
    //   metalRate = client.SilverPrice;
    // } else if (enquiry.Metal.Type === "Platinum") {
    //   metalRate = client.PlatinumPrice;
    // } else {
    //   if (enquiry.Metal.Quality === "14K") {
    //     metalRate = client.FourteenKPrice;
    //   } else if (enquiry.Metal.Quality === "18K") {
    //     metalRate = client.EighteenKPrice;
    //   } else if (enquiry.Metal.Quality === "22K") {
    //     metalRate = client.TwentyTwoKPrice;
    //   } else if (enquiry.Metal.Quality === "24K") {
    //     metalRate = client.TwentyFourKPrice;
    //   }
    // }

    // Fallback if excelTable.goldWeight is not a number (e.g., '15gms')
    const numericMetalWeight = parseFloat(excelTable.metalWeight);

    // Calculate Metal Price
    const lossFactor = loss / 100;
    const metalPrice = numericMetalWeight * ((metalRate * (1 + lossFactor)) + labour);
    console.log("Metal Price: ", metalPrice);


    // Calculate Diamonds Price
    // TODO add color when matching
    const stones = excelTable.stones.map(stone => {
        const matchingDiamond = client.Pricing.Diamonds.find(diamond =>
            diamond.Type === stone.type &&
            diamond.SieveSize === stone.sieveSize &&   
            diamond.Shape === stone.shape &&
            diamond.MmSize === stone.mmSize &&
            diamond.Carat === stone.weight
        );

        const ratePerStone = matchingDiamond ? matchingDiamond.Rate : 0;
        const price = stone.ctWeight * ratePerStone;

        return {
            ...stone,
            ratePerStone,
            price,
        };
    });
    console.log("Stones: ", stones);


    const diamondsPrice = stones.reduce((sum, stone) => sum + stone.price, 0);
    console.log("Diamonds Price: ", diamondsPrice);

    const subtotal = metalPrice + diamondsPrice + extraCharges;
    const dutiesAmount = subtotal * (duties / 100);
    const totalPrice = subtotal + dutiesAmount;

    return {
        MetalPrice: parseFloat(metalPrice.toFixed(2)),
        DiamondsPrice: parseFloat(diamondsPrice.toFixed(2)),
        TotalPrice: parseFloat(totalPrice.toFixed(2)),
        MetalWeight: numericMetalWeight,
        DiamondWeight: parseFloat(excelTable.diamondWeight),
        TotalPieces: excelTable.totalPieces,
        Client: {
            ExtraCharges: extraCharges,
            Duties: duties,
            Loss: loss,
            Labour: labour
        },
        Stones: stones.map(stone => ({
            Type: stone.type,
            Color: stone.color,
            Shape: stone.shape,
            MmSize: stone.mmSize,
            SieveSize: stone.sieveSize,
            Weight: stone.weight,
            Price: parseFloat(stone.ratePerStone.toFixed(3)),
            Pcs: stone.pcs,
            CtWeight: stone.ctWeight,
        }))
    };
}

exports.calculatePricing = async (pricingDetails, clientId) => {
    //TODO which metal is it-> take that as parameter
    const client = await clientService.getClient(clientId);
    stones = pricingDetails.Stones;
    metalWeight = parseFloat(pricingDetails.Metal.Weight);
    loss = pricingDetails.Metal.Loss || 0;
    labour = pricingDetails.Metal.Labour || 0;
    extraCharges = pricingDetails.ExtraCharges || 0;
    duties = pricingDetails.Duties || 0;
    metalRate = 104; //TODO get current metal rate

    const diamondWeight = stones.reduce((sum, stone) => {
        return sum + stone.CtWeight;
    }, 0);

    // Calculate Metal Price
    const lossFactor = loss / 100;
    const metalPrice = metalWeight * ((metalRate * (1 + lossFactor)) + labour);
    console.log("Metal Price: ", metalPrice);

    // Calculate Diamonds Price
    const diamondsPrice = stones.reduce((sum, stone) => {
        const ratePerStone = stone.Price;
        return sum + (stone.CtWeight * ratePerStone);
    }, 0);
    console.log("Diamonds Price: ", diamondsPrice);

    const subtotal = metalPrice + diamondsPrice + extraCharges;
    const dutiesAmount = subtotal * (duties / 100);
    const totalPrice = subtotal + dutiesAmount;
    return {
        MetalPrice: parseFloat(metalPrice.toFixed(2)),
        DiamondsPrice: parseFloat(diamondPrice.toFixed(2)),
        TotalPrice: parseFloat(totalPrice.toFixed(2)),
        MetalWeight: metalWeight,
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