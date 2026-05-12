const metalPricesService = require('./metalPrices.service');
const clientService = require('./client.service');

function normalizeNumber(num) {
    const n = parseFloat(num);
    return isNaN(n) ? num : n.toString();
}

function normalizeMmSize(value) {
    if (!value) return "";
    value = value.toLowerCase().trim();
    value = value.replace(/\s+/g, "");
    if (value.includes("x")) {
        const parts = value.split("x").map(v => normalizeNumber(v));
        return parts.join("x");
    }
    return normalizeNumber(value);
}

async function resolvePricingContext(pricingDetails, clientId) {
    const todaysMetalRates = await metalPricesService.getLatest();

    const metalWeight = parseFloat(pricingDetails.Metal.Weight);
    const metalQuality = pricingDetails.Metal.Quality;
    const metalRateOverride = pricingDetails.Metal.Rate;
    const quantity = pricingDetails.Quantity || 1;

    let metalRate, metalFullRate;

    if (metalQuality === "Silver 925") {
        metalRate = metalRateOverride ?? todaysMetalRates.silver?.price ?? 0;
        metalFullRate = metalRate;
    } else if (metalQuality === "Platinum") {
        metalRate = metalRateOverride ?? todaysMetalRates.platinum?.price ?? 0;
        metalFullRate = metalRate;
    } else {
        const goldRate = metalRateOverride ?? todaysMetalRates.gold?.price ?? 0;
        metalFullRate = goldRate;

        const match = metalQuality?.toUpperCase().match(/^(\d{1,2})K$/);
        if (!match) throw new Error(`Invalid gold quality: ${metalQuality}`);

        metalRate = (goldRate * parseInt(match[1], 10)) / 24;
        console.log(`[pricing] gold rate: ${goldRate}, karat: ${match[1]}, metalRate: ${metalRate}`);
    }

    let client = clientId ? await clientService.getClient(clientId) : null;

    const duties = {
        natural: pricingDetails?.NaturalDuties ?? client?.Pricing?.NaturalDuties ?? 0,
        lab: pricingDetails?.LabDuties ?? client?.Pricing?.LabDuties ?? 0,
        gold: pricingDetails?.GoldDuties ?? client?.Pricing?.GoldDuties ?? 0,
        silverAndLab: pricingDetails?.SilverAndLabsDuties ?? client?.Pricing?.SilverAndLabsDuties ?? 0,
        lossAndLabour: pricingDetails?.LossAndLabourDuties ?? client?.Pricing?.LossAndLabourDuties ?? 0
    };

    const charges = {
        loss: pricingDetails?.Loss ?? client?.Pricing?.Loss ?? 0,
        labour: pricingDetails?.Labour ?? client?.Pricing?.Labour ?? 0,
        extraCharges: pricingDetails?.ExtraCharges ?? client?.Pricing?.ExtraCharges ?? 0,
        undercutPrice: pricingDetails?.UndercutPrice ?? client?.Pricing?.UndercutPrice ?? 0
    };

    let stones = pricingDetails.Stones;

    if (client) {
        stones = stones.map(stone => {
            const match = client.Pricing.Diamonds.find(d =>
                d.Type === stone.Type &&
                d.Shape === stone.Shape &&
                normalizeMmSize(d.MmSize) === normalizeMmSize(stone.MmSize)
            );

            return {
                ...stone,
                Price: match?.Price ?? 0,
                Markup: 0
            };
        });
    }

    return {
        metal: { weight: metalWeight, quality: metalQuality, rate: metalRate, fullRate: metalFullRate },
        stones,
        quantity,
        duties,
        charges,
        totalPieces: pricingDetails.TotalPieces,
        pricingMessageFormat: client?.PricingMessageFormat || null
    };
}


function calculatePricingEngine(context) {
    const { metal, stones, quantity, duties, charges } = context;

    const lossFactor = charges.loss / 100;
    console.log(`[pricing] lossFactor: ${lossFactor} (loss: ${charges.loss}%)`);

    const lossAmount = metal.weight * metal.rate * lossFactor;
    console.log(`[pricing] lossAmount: ${lossAmount} (weight: ${metal.weight} * rate: ${metal.rate} * lossFactor: ${lossFactor})`);

    const labourAmount = metal.weight * charges.labour;
    console.log(`[pricing] labourAmount: ${labourAmount} (weight: ${metal.weight} * labour: ${charges.labour})`);

    const metalPrice = metal.weight * ((metal.rate * (1 + lossFactor)) + charges.labour);
    console.log(`[pricing] metalPrice: ${metalPrice} (weight: ${metal.weight}, rate: ${metal.rate}, lossFactor: ${lossFactor}, labour: ${charges.labour})`);

    // --- DIAMONDS ---
    let diamondsPrice = 0;
    let diamondWeight = 0;

    stones.forEach(stone => {
        const rate = stone.Price + (stone.Markup || 0);
        const stoneValue = stone.CtWeight * rate;
        console.log(`[pricing] stone [${stone.Type} ${stone.Shape}]: ctWeight: ${stone.CtWeight}, price: ${stone.Price}, markup: ${stone.Markup || 0}, rate: ${rate}, value: ${stoneValue}`);
        diamondsPrice += stoneValue;
        diamondWeight += stone.CtWeight;
    });

    // --- CLASSIFICATION ---
    const isLab = (t) => t === 'LabGrown' || t === 'CVDLabGrown';
    const isSilver = metal.quality === 'Silver 925';
    const isGold = !isSilver && metal.quality !== 'Platinum';

    let naturalBase = 0, labGoldBase = 0, labSilverBase = 0;

    stones.forEach(stone => {
        const val = stone.CtWeight * (stone.Price + (stone.Markup || 0));
        if (isLab(stone.Type)) {
            if (isSilver) labSilverBase += val;
            else labGoldBase += val;
        } else {
            naturalBase += val;
        }
    });
    console.log(`[pricing] bases — naturalBase: ${naturalBase}, labGoldBase: ${labGoldBase}, labSilverBase: ${labSilverBase}`);

    const goldBase = isGold ? metalPrice : 0;
    const silverBase = isSilver ? metalPrice : 0;
    console.log(`[pricing] goldBase: ${goldBase}, silverBase: ${silverBase} (isGold: ${isGold}, isSilver: ${isSilver})`);

    const lossAndLabourBase = lossAmount + labourAmount;
    console.log(`[pricing] lossAndLabourBase: ${lossAndLabourBase} (lossAmount: ${lossAmount} + labourAmount: ${labourAmount})`);

    // --- NATURAL DUTIES BASE (capped at undercutPrice if provided) ---
    let naturalBaseCappedForDuties = 0;
    stones.forEach(stone => {
        if (!isLab(stone.Type)) {
            const stonePrice = stone.Price + (stone.Markup || 0);
            const stonePriceCapped = charges.undercutPrice > 0 
                ? Math.min(stonePrice, charges.undercutPrice)
                : stonePrice;
            const val = stone.CtWeight * stonePriceCapped;
            naturalBaseCappedForDuties += val;
        }
    });
    console.log(`[pricing] naturalBaseCappedForDuties: ${naturalBaseCappedForDuties} (capped at undercutPrice: ${charges.undercutPrice})`);

    // --- DUTIES ---
    const breakdown = {
        natural: naturalBaseCappedForDuties * quantity * duties.natural / 100,
        lab: labGoldBase * quantity * duties.lab / 100,
        gold: goldBase * quantity * duties.gold / 100,
        silverAndLab:
            (labSilverBase + silverBase) * quantity * duties.silverAndLab / 100,
        lossAndLabour:
            lossAndLabourBase * quantity * duties.lossAndLabour / 100
    };
    console.log(`[pricing] duties breakdown:`, breakdown);

    const dutiesAmount = Object.values(breakdown).reduce((a, b) => a + b, 0);
    console.log(`[pricing] dutiesAmount: ${dutiesAmount}`);

    const totalPrice =
        (((metalPrice + diamondsPrice) * quantity) + dutiesAmount) *
        (1 + (charges.extraCharges / 100));
    console.log(`[pricing] totalPrice: ${totalPrice} (metalPrice: ${metalPrice}, diamondsPrice: ${diamondsPrice}, quantity: ${quantity}, dutiesAmount: ${dutiesAmount}, extraCharges: ${charges.extraCharges}%)`);

    return {
        metalPrice,
        diamondsPrice,
        diamondWeight,
        dutiesAmount,
        breakdown,
        totalPrice,

        // 🔥 THIS IS THE KEY FIX
        bases: {
            natural: naturalBase,
            labGold: labGoldBase,
            labSilver: labSilverBase,
            gold: goldBase,
            silver: silverBase,
            lossAndLabour: lossAndLabourBase
        }
    };
}

function formatPricingResponse(context, calc) {
    console.log(context);
    return {
        MetalPrice: +calc.metalPrice.toFixed(3),
        DiamondsPrice: +calc.diamondsPrice.toFixed(3),
        TotalPrice: +calc.totalPrice.toFixed(3),

        DutiesAmount: +calc.dutiesAmount.toFixed(3),

        Applicable: {
            NaturalDuties: calc.bases.natural > 0,
            LabDuties: calc.bases.labGold > 0,
            GoldDuties: calc.bases.gold > 0,
            SilverAndLabsDuties: calc.bases.labSilver > 0,
            LossAndLabourDuties: calc.bases.lossAndLabour > 0
        },

        Metal: {
            Weight: context.metal.weight,
            Quality: context.metal.quality,
            Rate: +context.metal.fullRate.toFixed(3)
        },

        DiamondWeight: +calc.diamondWeight.toFixed(3),
        TotalPieces: context.totalPieces,

        Stones: context.stones.map(stone => ({
            Type: stone.Type,
            Color: stone.Color,
            Shape: stone.Shape,
            MmSize: stone.MmSize,
            SieveSize: stone.SieveSize,
            Weight: stone.Weight,
            Pcs: stone.Pcs,
            CtWeight: stone.CtWeight,
            Price: +((stone.Price ?? 0).toFixed(3)),
            Markup: +((stone.Markup ?? 0).toFixed(3))
        })),

        Client: {
            Loss: context.charges.loss,
            Labour: context.charges.labour,
            ExtraCharges: context.charges.extraCharges,
            UndercutPrice: context.charges.undercutPrice,
            NaturalDuties: context.duties.natural,
            LabDuties: context.duties.lab,
            GoldDuties: context.duties.gold,
            SilverAndLabsDuties: context.duties.silverAndLab,
            LossAndLabourDuties: context.duties.lossAndLabour
        }
    };
}

module.exports = {
    resolvePricingContext,
    calculatePricingEngine,
    formatPricingResponse,
    normalizeMmSize
};
