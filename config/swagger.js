const swaggerSpec = {
    openapi: '3.0.0',
    info: {
        title: 'Chandra Workflow API',
        version: '1.0.0',
        description: 'Backend API for the Chandra jewellery workflow management system.',
    },
    servers: process.env.NODE_ENV === 'production'
        ? [
            { url: 'https://workflowapi-quhn.onrender.com', description: 'Production' },
            { url: `http://localhost:${process.env.PORT || 3000}`, description: 'Local' },
          ]
        : [
            { url: `http://localhost:${process.env.PORT || 3000}`, description: 'Local' },
            { url: 'https://workflowapi-quhn.onrender.com', description: 'Production' },
          ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
            },
        },
        schemas: {
            // ── Auth ────────────────────────────────────────────────────────
            LoginRequest: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email:    { type: 'string', format: 'email' },
                    password: { type: 'string' },
                },
            },
            LoginResponse: {
                type: 'object',
                properties: {
                    token: { type: 'string' },
                },
            },

            // ── Client ──────────────────────────────────────────────────────
            Client: {
                type: 'object',
                properties: {
                    _id:           { type: 'string' },
                    Name:          { type: 'string' },
                    ImageUrl:      { type: 'string' },
                    PriorityOrder: { type: 'number', description: 'Lower number = higher priority client' },
                    Pricing: {
                        type: 'object',
                        properties: {
                            Loss:                { type: 'number' },
                            Labour:              { type: 'number' },
                            ExtraCharges:        { type: 'number' },
                            NaturalDuties:       { type: 'number', description: 'Duty % on natural diamond value' },
                            LabDuties:           { type: 'number', description: 'Duty % on lab diamond value (when metal is gold)' },
                            GoldDuties:          { type: 'number', description: 'Duty % on gold metal value' },
                            SilverAndLabsDuties: { type: 'number', description: 'Flat duty % on silver-metal + lab-stone combined base' },
                            LossAndLabourDuties: { type: 'number', description: 'Duty % applied to the loss + labour portion of the metal price' },
                            UndercutPrice:       { type: 'number', description: 'Per-carat cap used as the duty base when applied' },
                            Diamonds: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        Type:     { type: 'string' },
                                        Shape:    { type: 'string' },
                                        Carat:    { type: 'number' },
                                        MmSize:   { type: 'string' },
                                        SieveSize:{ type: 'string' },
                                        Price:    { type: 'number' },
                                    },
                                },
                            },
                        },
                    },
                    PricingMessageFormat: {
                        type: 'string',
                        description: 'Template string used to format the client-facing pricing message.',
                    },
                },
            },

            // ── User ────────────────────────────────────────────────────────
            User: {
                type: 'object',
                properties: {
                    Id:       { type: 'string' },
                    Name:     { type: 'string' },
                    Role:     { type: 'number' },
                    Skills:   { type: 'string' },
                    email:    { type: 'string', format: 'email' },
                    phone:    { type: 'string' },
                    clientId: { type: 'string', description: 'Set for client-role users' },
                    group:    { type: 'string', enum: ['Bridal', 'Hip-hop', 'Cuban'], description: 'Designer specialisation group' },
                },
            },
            UserSummary: {
                type: 'object',
                description: 'Slim user shape returned by the list endpoint (no email/phone/clientId).',
                properties: {
                    Id:     { type: 'string' },
                    Name:   { type: 'string' },
                    Role:   { type: 'number' },
                    Skills: { type: 'string' },
                    group:  { type: 'string', enum: ['Bridal', 'Hip-hop', 'Cuban'] },
                },
            },

            // ── Metal Prices ────────────────────────────────────────────────
            MetalPrice: {
                type: 'object',
                properties: {
                    _id:   { type: 'string' },
                    metal: { type: 'string', example: 'gold' },
                    price: { type: 'number' },
                    date:  { type: 'string', format: 'date-time' },
                },
            },

            // ── Enquiry ─────────────────────────────────────────────────────
            EnquiryBase: {
                type: 'object',
                properties: {
                    Name:            { type: 'string' },
                    Quantity:        { type: 'number' },
                    StyleNumber:     { type: 'string' },
                    GatiOrderNumber: { type: 'string' },
                    ClientId:        { type: 'string' },
                    Priority:        { type: 'string', enum: ['Low', 'Medium', 'High', 'Urgent'] },
                    Category:        { type: 'string' },
                    StoneType:       { type: 'string' },
                    Metal: {
                        type: 'object',
                        properties: {
                            Color:   { type: 'string' },
                            Quality: { type: 'string' },
                        },
                    },
                    MetalWeight: {
                        type: 'object',
                        properties: {
                            From:  { type: 'number' },
                            To:    { type: 'number' },
                            Exact: { type: 'number' },
                        },
                    },
                    DiamondWeight: {
                        type: 'object',
                        properties: {
                            From:  { type: 'number' },
                            To:    { type: 'number' },
                            Exact: { type: 'number' },
                        },
                    },
                    Stamping:        { type: 'string' },
                    Remarks:         { type: 'string' },
                    SpecialRemarks:  { type: 'string' },
                    Budget:          { type: 'string' },
                    ShippingDate:    { type: 'string', format: 'date-time' },
                },
            },
            Enquiry: {
                allOf: [
                    { $ref: '#/components/schemas/EnquiryBase' },
                    {
                        type: 'object',
                        properties: {
                            _id: { type: 'string' },
                            StatusHistory: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        Status:     { type: 'string' },
                                        Timestamp:  { type: 'string', format: 'date-time' },
                                        AssignedTo: { type: 'string' },
                                        Details:    { type: 'string' },
                                        AddedBy:    { type: 'string' },
                                    },
                                },
                            },
                            ReferenceImages: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        Id:          { type: 'string' },
                                        Key:         { type: 'string' },
                                        Description: { type: 'string' },
                                        MimeType:    { type: 'string' },
                                    },
                                },
                            },
                            SimilarDesigns: {
                                type: 'array',
                                description: 'Top similar past designs (populated asynchronously after create).',
                                items: {
                                    type: 'object',
                                    properties: {
                                        EnquiryId: { type: 'string' },
                                        Key:       { type: 'string' },
                                        Score:     { type: 'number' },
                                    },
                                },
                            },
                            Coral: { type: 'array', items: { $ref: '#/components/schemas/CoralVersion' } },
                            Cad:   { type: 'array', items: { $ref: '#/components/schemas/CadVersion' } },
                        },
                    },
                ],
            },
            AssetImage: {
                type: 'object',
                description: 'A Coral or CAD image attached to a version.',
                properties: {
                    Id:          { type: 'string' },
                    Key:         { type: 'string', description: 'S3 key' },
                    Description: { type: 'string' },
                },
            },
            AssetExcel: {
                type: 'object',
                description: 'A Coral or CAD excel attached to a version.',
                properties: {
                    Id:          { type: 'string' },
                    Key:         { type: 'string', description: 'S3 key' },
                    Description: { type: 'string' },
                },
            },
            PricingSnapshot: {
                type: 'object',
                description: 'A pricing record persisted on a Coral or CAD version. Captures both the computed totals and the rate/charge snapshot that was applied at quote time.',
                properties: {
                    MetalPrice:           { type: 'number' },
                    DiamondsPrice:        { type: 'number' },
                    TotalPrice:           { type: 'number' },
                    DutiesAmount:         { type: 'number', description: 'Sum of all duty buckets applied to this quote' },
                    NaturalDuties:        { type: 'number', description: 'Rate % applied at quote time' },
                    LabDuties:            { type: 'number' },
                    GoldDuties:           { type: 'number' },
                    SilverAndLabsDuties:  { type: 'number' },
                    LossAndLabourDuties:  { type: 'number' },
                    Loss:                 { type: 'number' },
                    Labour:               { type: 'number' },
                    ExtraCharges:         { type: 'number' },
                    UndercutPrice:        { type: 'number' },
                    DiamondWeight:        { type: 'number' },
                    TotalPieces:          { type: 'number' },
                    ClientPricingMessage: { type: 'string', nullable: true },
                    Metal: {
                        type: 'object',
                        properties: {
                            Weight:  { type: 'number' },
                            Color:   { type: 'string' },
                            Quality: { type: 'string' },
                            Rate:    { type: 'number' },
                        },
                    },
                    Stones: { type: 'array', items: { $ref: '#/components/schemas/PricingStoneInput' } },
                },
            },
            CoralVersion: {
                type: 'object',
                properties: {
                    Version:            { type: 'string', example: 'Version 1' },
                    CoralCode:          { type: 'string' },
                    Images:             { type: 'array', items: { $ref: '#/components/schemas/AssetImage' } },
                    Excel:              { $ref: '#/components/schemas/AssetExcel' },
                    Pricing:            { type: 'array', items: { $ref: '#/components/schemas/PricingSnapshot' } },
                    ShowToClient:       { type: 'boolean' },
                    IsApprovedVersion:  { type: 'boolean' },
                    ReasonForRejection: { type: 'string' },
                    CreatedDate:        { type: 'string', format: 'date-time' },
                },
            },
            CadVersion: {
                type: 'object',
                properties: {
                    Version:            { type: 'string', example: 'Version 1' },
                    CadCode:            { type: 'string' },
                    Images:             { type: 'array', items: { $ref: '#/components/schemas/AssetImage' } },
                    Excel:              { $ref: '#/components/schemas/AssetExcel' },
                    Pricing:            { type: 'array', items: { $ref: '#/components/schemas/PricingSnapshot' } },
                    ShowToClient:       { type: 'boolean' },
                    IsFinalVersion:     { type: 'boolean' },
                    ReasonForRejection: { type: 'string' },
                    CreatedDate:        { type: 'string', format: 'date-time' },
                },
            },
            PricingStoneInput: {
                type: 'object',
                description: 'A stone line from the parsed Excel sheet, with Type set from the enquiry StoneType (Natural / LabGrown / CVDLabGrown).',
                properties: {
                    Type:      { type: 'string' },
                    Color:     { type: 'string' },
                    Shape:     { type: 'string' },
                    MmSize:    { type: 'string' },
                    SieveSize: { type: 'string' },
                    Weight:    { type: 'number' },
                    Pcs:       { type: 'number' },
                    CtWeight:  { type: 'number' },
                    Price:     { type: 'number', description: 'Per-carat price. When clientId is set, this is looked up from Client.Pricing.Diamonds.' },
                    Markup:    { type: 'number' },
                },
            },
            PricingDetails: {
                type: 'object',
                description: 'Pricing input. With a clientId, duty rates and stone prices are sourced from Client.Pricing; without one, all rate/charge fields must be supplied here.',
                properties: {
                    Quantity:            { type: 'number' },
                    TotalPieces:         { type: 'number' },
                    DiamondWeight:       { type: 'number' },
                    Metal: {
                        type: 'object',
                        properties: {
                            Weight:  { type: 'number' },
                            Quality: { type: 'string', description: 'e.g. "14K", "18K", "Silver 925", "Platinum"' },
                            Rate:    { type: 'number', description: 'Optional override; otherwise today\'s market rate is used.' },
                        },
                    },
                    Stones: { type: 'array', items: { $ref: '#/components/schemas/PricingStoneInput' } },
                    Loss:                { type: 'number' },
                    Labour:              { type: 'number' },
                    ExtraCharges:        { type: 'number' },
                    UndercutPrice:       { type: 'number' },
                    NaturalDuties:       { type: 'number' },
                    LabDuties:           { type: 'number' },
                    GoldDuties:          { type: 'number' },
                    SilverAndLabsDuties: { type: 'number' },
                    LossAndLabourDuties: { type: 'number' },
                },
            },
            PricingResult: {
                type: 'object',
                description: 'Output of calculatePricing. DutiesAmount is the total of all applicable duty buckets; the per-category rates under Client are editable inputs.',
                properties: {
                    MetalPrice:        { type: 'number' },
                    DiamondsPrice:     { type: 'number' },
                    TotalPrice:        { type: 'number' },
                    DutiesAmount:      { type: 'number', description: 'Sum of all duty buckets' },
                    Applicable: {
                        type: 'object',
                        description: 'Flags telling the UI which duty inputs to render for this metal × stone combination.',
                        properties: {
                            NaturalDuties:       { type: 'boolean' },
                            LabDuties:           { type: 'boolean' },
                            GoldDuties:          { type: 'boolean' },
                            SilverAndLabsDuties: { type: 'boolean' },
                            LossAndLabourDuties: { type: 'boolean' },
                        },
                    },
                    Metal: {
                        type: 'object',
                        properties: {
                            Weight:  { type: 'number' },
                            Quality: { type: 'string' },
                            Rate:    { type: 'number' },
                        },
                    },
                    DiamondWeight: { type: 'number' },
                    TotalPieces:   { type: 'number' },
                    Stones: { type: 'array', items: { $ref: '#/components/schemas/PricingStoneInput' } },
                    Client: {
                        type: 'object',
                        description: 'Resolved rates and charges that were applied (echo of policy or per-call inputs).',
                        properties: {
                            Loss:                { type: 'number' },
                            Labour:              { type: 'number' },
                            ExtraCharges:        { type: 'number' },
                            UndercutPrice:       { type: 'number' },
                            NaturalDuties:       { type: 'number' },
                            LabDuties:           { type: 'number' },
                            GoldDuties:          { type: 'number' },
                            SilverAndLabsDuties: { type: 'number' },
                            LossAndLabourDuties: { type: 'number' },
                        },
                    },
                    ClientPricingMessage: { type: 'string', nullable: true, description: 'Present only when the client has a PricingMessageFormat template; LLM-generated.' },
                },
            },
            EnquiryCreateRequest: {
                allOf: [
                    { $ref: '#/components/schemas/EnquiryBase' },
                    {
                        type: 'object',
                        properties: {
                            Status:     { type: 'string' },
                            AssignedTo: { type: 'string' },
                        },
                    },
                ],
            },

            // ── Parse ────────────────────────────────────────────────────────
            ParseRequest: {
                type: 'object',
                required: ['message'],
                properties: {
                    message:   { type: 'string', description: 'Free-text order description from the user' },
                    mediaType: {
                        type: 'string',
                        enum: ['coral', 'cad', 'approved_cad'],
                        description: 'Type of media being requested',
                    },
                },
            },
            MissingField: {
                type: 'object',
                properties: {
                    field:   { type: 'string', example: 'Metal.Color' },
                    label:   { type: 'string', example: 'Metal Colour' },
                    options: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                label: { type: 'string' },
                                value: { type: 'string' },
                            },
                        },
                    },
                },
            },
            ParseResponse: {
                type: 'object',
                properties: {
                    parsed: { $ref: '#/components/schemas/EnquiryBase' },
                    missingFields: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/MissingField' },
                    },
                },
            },

            // ── Chat & Message ───────────────────────────────────────────────
            Chat: {
                type: 'object',
                properties: {
                    _id:         { type: 'string' },
                    EnquiryId:   { type: 'string' },
                    Name:        { type: 'string' },
                    Type:        { type: 'string', enum: ['admin-client', 'admin-designer'] },
                    Participants: { type: 'array', items: { type: 'string' } },
                    LastMessage: { type: 'string' },
                    UpdatedAt:   { type: 'string', format: 'date-time' },
                },
            },
            Message: {
                type: 'object',
                properties: {
                    _id:       { type: 'string' },
                    ChatId:    { type: 'string' },
                    SenderId:  { type: 'string' },
                    Content:   { type: 'string' },
                    MediaUrl:  { type: 'string' },
                    IsDeleted: { type: 'boolean' },
                    CreatedAt: { type: 'string', format: 'date-time' },
                },
            },

            // ── Notifications ────────────────────────────────────────────────
            Notification: {
                type: 'object',
                properties: {
                    _id:     { type: 'string' },
                    UserId:  { type: 'string' },
                    Title:   { type: 'string' },
                    Body:    { type: 'string' },
                    Type:    { type: 'string' },
                    Link:    { type: 'string' },
                    IsRead:  { type: 'boolean' },
                    CreatedAt: { type: 'string', format: 'date-time' },
                },
            },

            // ── Codelists ────────────────────────────────────────────────────
            CodeValue: {
                type: 'object',
                properties: {
                    Id:   { },
                    Code: { type: 'string' },
                    Name: { type: 'string' },
                },
            },

            // ── Errors ───────────────────────────────────────────────────────
            Error: {
                type: 'object',
                properties: {
                    message: { type: 'string' },
                },
            },
        },
    },

    // ── Security default (override per-route where needed) ─────────────────────
    security: [{ bearerAuth: [] }],

    paths: {
        // ════════════════════════════════════════════════════════════════════
        // Health
        // ════════════════════════════════════════════════════════════════════
        '/health': {
            get: {
                tags: ['System'],
                summary: 'Health check',
                security: [],
                responses: {
                    200: {
                        description: 'Server is healthy',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        status: { type: 'string', example: 'ok' },
                                        db:     { type: 'number', example: 1 },
                                        uptime: { type: 'number' },
                                    },
                                },
                            },
                        },
                    },
                    503: { description: 'Server degraded (DB disconnected)' },
                },
            },
        },

        // ════════════════════════════════════════════════════════════════════
        // Auth
        // ════════════════════════════════════════════════════════════════════
        '/api/login': {
            post: {
                tags: ['Auth'],
                summary: 'Login and receive a JWT',
                security: [],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
                    },
                },
                responses: {
                    200: {
                        description: 'JWT token',
                        content: {
                            'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } },
                        },
                    },
                    400: { description: 'Invalid credentials' },
                    500: { description: 'Server error' },
                },
            },
        },

        // ════════════════════════════════════════════════════════════════════
        // Clients
        // ════════════════════════════════════════════════════════════════════
        '/api/clients': {
            get: {
                tags: ['Clients'],
                summary: 'Get all clients',
                responses: {
                    200: {
                        description: 'List of clients',
                        content: {
                            'application/json': {
                                schema: { type: 'array', items: { $ref: '#/components/schemas/Client' } },
                            },
                        },
                    },
                },
            },
            post: {
                tags: ['Clients'],
                summary: 'Create a new client',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/Client' } },
                    },
                },
                responses: {
                    201: { description: 'Client created' },
                    500: { description: 'Server error' },
                },
            },
        },
        '/api/clients/{id}': {
            get: {
                tags: ['Clients'],
                summary: 'Get client by ID',
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
                responses: {
                    200: {
                        content: {
                            'application/json': { schema: { $ref: '#/components/schemas/Client' } },
                        },
                    },
                    404: { description: 'Not found' },
                },
            },
            put: {
                tags: ['Clients'],
                summary: 'Update client by ID',
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/Client' } },
                    },
                },
                responses: {
                    200: { description: 'Updated client' },
                    404: { description: 'Not found' },
                },
            },
        },

        // ════════════════════════════════════════════════════════════════════
        // Users
        // ════════════════════════════════════════════════════════════════════
        '/api/users': {
            get: {
                tags: ['Users'],
                summary: 'Get all users',
                responses: {
                    200: {
                        content: {
                            'application/json': {
                                schema: { type: 'array', items: { $ref: '#/components/schemas/UserSummary' } },
                            },
                        },
                    },
                },
            },
            post: {
                tags: ['Users'],
                summary: 'Create a new user',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['name', 'email', 'role', 'password'],
                                properties: {
                                    name:     { type: 'string' },
                                    email:    { type: 'string', format: 'email' },
                                    phone:    { type: 'string' },
                                    role:     { type: 'number' },
                                    password: { type: 'string' },
                                    clientId: { type: 'string' },
                                    skills:   { type: 'string' },
                                    group:    { type: 'string', enum: ['Bridal', 'Hip-hop', 'Cuban'] },
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: { description: 'Created user', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                    400: { description: 'Missing required fields' },
                    409: { description: 'Email or phone already in use' },
                },
            },
        },
        '/api/users/{id}': {
            get: {
                tags: ['Users'],
                summary: 'Get user by ID',
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                    404: { description: 'Not found' },
                },
            },
            put: {
                tags: ['Users'],
                summary: 'Update a user (password cannot be changed here)',
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    name:     { type: 'string' },
                                    email:    { type: 'string', format: 'email' },
                                    phone:    { type: 'string' },
                                    role:     { type: 'number' },
                                    clientId: { type: 'string' },
                                    skills:   { type: 'string' },
                                    group:    { type: 'string', enum: ['Bridal', 'Hip-hop', 'Cuban'] },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: 'Updated user', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                    404: { description: 'User not found' },
                    409: { description: 'Email or phone already in use' },
                },
            },
        },
        '/api/users/registerPushToken': {
            post: {
                tags: ['Users'],
                summary: 'Register an FCM push token for the authenticated user',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['token'],
                                properties: { token: { type: 'string' } },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: 'Push token saved' },
                    400: { description: 'Token required' },
                },
            },
        },

        // ════════════════════════════════════════════════════════════════════
        // Metal Prices
        // ════════════════════════════════════════════════════════════════════
        '/api/metal-prices': {
            get: {
                tags: ['Metal Prices'],
                summary: 'Get all metal price entries',
                responses: {
                    200: {
                        content: {
                            'application/json': {
                                schema: { type: 'array', items: { $ref: '#/components/schemas/MetalPrice' } },
                            },
                        },
                    },
                },
            },
            post: {
                tags: ['Metal Prices'],
                summary: 'Add a new metal price entry',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/MetalPrice' } },
                    },
                },
                responses: { 201: { description: 'Created' } },
            },
        },
        '/api/metal-prices/latest': {
            get: {
                tags: ['Metal Prices'],
                summary: 'Get the latest price for each metal',
                responses: {
                    200: {
                        content: {
                            'application/json': {
                                schema: { type: 'array', items: { $ref: '#/components/schemas/MetalPrice' } },
                            },
                        },
                    },
                },
            },
        },
        '/api/metal-prices/{metal}': {
            put: {
                tags: ['Metal Prices'],
                summary: 'Update price for a specific metal',
                parameters: [{ in: 'path', name: 'metal', required: true, schema: { type: 'string' }, example: 'gold' }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/MetalPrice' } },
                    },
                },
                responses: { 200: { description: 'Updated' } },
            },
            delete: {
                tags: ['Metal Prices'],
                summary: 'Delete a metal price entry',
                parameters: [{ in: 'path', name: 'metal', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Deleted' } },
            },
        },

        // ════════════════════════════════════════════════════════════════════
        // Enquiries
        // ════════════════════════════════════════════════════════════════════
        '/api/enquiries/parse': {
            post: {
                tags: ['Enquiries'],
                summary: 'Parse a free-text message into a structured enquiry draft',
                description: 'Calls OpenAI to extract enquiry fields. Returns `parsed` (filled fields) and `missingFields` (fields the LLM could not determine, with options for the frontend to resolve).',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/ParseRequest' } },
                    },
                },
                responses: {
                    200: {
                        content: {
                            'application/json': { schema: { $ref: '#/components/schemas/ParseResponse' } },
                        },
                    },
                    400: { description: '`message` field is required' },
                    500: { description: 'LLM or server error' },
                },
            },
        },
        '/api/enquiries/export-pdf': {
            get: {
                tags: ['Enquiries'],
                summary: 'Export enquiries as PDF',
                parameters: [
                    { in: 'query', name: 'search', schema: { type: 'string' } },
                    { in: 'query', name: 'status', schema: { type: 'string' } },
                    { in: 'query', name: 'clientId', schema: { type: 'string' } },
                ],
                responses: {
                    200: { description: 'PDF file', content: { 'application/pdf': {} } },
                },
            },
        },
        '/api/enquiries/search': {
            get: {
                tags: ['Enquiries'],
                summary: 'Search and filter enquiries',
                parameters: [
                    { in: 'query', name: 'search',    schema: { type: 'string' }, description: 'Full-text search term' },
                    { in: 'query', name: 'status',    schema: { type: 'string' } },
                    { in: 'query', name: 'clientId',  schema: { type: 'string' } },
                    { in: 'query', name: 'category',  schema: { type: 'string' } },
                    { in: 'query', name: 'page',      schema: { type: 'integer', default: 1 } },
                    { in: 'query', name: 'limit',     schema: { type: 'integer', default: 25 } },
                    { in: 'query', name: 'sortBy',    schema: { type: 'string', default: 'AssignedDate' } },
                    { in: 'query', name: 'sortOrder', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
                ],
                responses: {
                    200: {
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        data:  { type: 'array', items: { $ref: '#/components/schemas/Enquiry' } },
                                        total: { type: 'number' },
                                        page:  { type: 'number' },
                                        limit: { type: 'number' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/api/enquiries/aggregate': {
            get: {
                tags: ['Enquiries'],
                summary: 'Get aggregated enquiry counts',
                parameters: [
                    { in: 'query', name: 'groupBy', required: true, schema: { type: 'string' }, example: 'status' },
                    { in: 'query', name: 'clientId', schema: { type: 'string' } },
                ],
                responses: {
                    200: { description: 'Aggregated counts' },
                    400: { description: 'Missing groupBy parameter' },
                },
            },
        },
        '/api/enquiries/pricingCalculate': {
            post: {
                tags: ['Enquiries'],
                summary: 'Calculate pricing for an enquiry',
                description: 'With clientId, duty rates and stone prices are resolved from Client.Pricing. Without clientId, the caller must supply rates and per-stone Price values in details. Used both on initial Coral/CAD upload (with clientId) and on frontend recalculation after editing the four duty rates (typically without clientId).',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['details'],
                                properties: {
                                    details:  { $ref: '#/components/schemas/PricingDetails' },
                                    clientId: { type: 'string', nullable: true },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description: 'Pricing result',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/PricingResult' },
                            },
                        },
                    },
                },
            },
        },
        '/api/enquiries/mass-action': {
            post: {
                tags: ['Enquiries'],
                summary: 'Apply a bulk action to multiple enquiries',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['enquiryIds', 'updateType'],
                                properties: {
                                    enquiryIds:  { type: 'array', items: { type: 'string' } },
                                    updateType:  { type: 'string' },
                                    newStatus:   { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: { 200: { description: 'Mass action result' } },
            },
        },
        '/api/enquiries/files/{key}': {
            get: {
                tags: ['Enquiries'],
                summary: 'Get a presigned S3 URL for a file',
                parameters: [
                    { in: 'path',  name: 'key',      required: true, schema: { type: 'string' } },
                    { in: 'query', name: 'download',  schema: { type: 'boolean' }, description: 'Set true to force download' },
                ],
                responses: {
                    200: {
                        content: {
                            'application/json': {
                                schema: { type: 'object', properties: { url: { type: 'string' } } },
                            },
                        },
                    },
                    400: { description: 'Invalid S3 key' },
                },
            },
        },
        '/api/enquiries': {
            post: {
                tags: ['Enquiries'],
                summary: 'Create a new enquiry (multipart, with reference images)',
                description: 'Send the enquiry payload as a stringified JSON in the `data` field. Attach up to 10 reference files (images, videos, PDFs — anything) under the `referenceImages` field, each up to 50 MB.\n\nAfter creation, an async hook describes/embeds the reference images, auto-assigns a Coral or Cad designer based on user skills, and populates `SimilarDesigns` on the enquiry.',
                requestBody: {
                    required: true,
                    content: {
                        'multipart/form-data': {
                            schema: {
                                type: 'object',
                                required: ['data'],
                                properties: {
                                    data: {
                                        type: 'string',
                                        description: 'Stringified JSON of EnquiryCreateRequest',
                                        example: '{"Name":"Diamond ring","Status":"Coral","ClientId":"66a..."}',
                                    },
                                    referenceImages: {
                                        type: 'array',
                                        items: { type: 'string', format: 'binary' },
                                        description: 'Reference files (images, videos, etc.) up to 10 files, max 50 MB each',
                                    },
                                },
                            },
                        },
                        'application/json': { schema: { $ref: '#/components/schemas/EnquiryCreateRequest' } },
                    },
                },
                responses: {
                    201: { description: 'Enquiry ID of the created enquiry' },
                    400: { description: "Invalid JSON in 'data' field" },
                    500: { description: 'Server error' },
                },
            },
        },
        '/api/enquiries/{id}': {
            get: {
                tags: ['Enquiries'],
                summary: 'Get enquiry by ID',
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Enquiry' } } } },
                    404: { description: 'Not found' },
                },
            },
            put: {
                tags: ['Enquiries'],
                summary: 'Update enquiry by ID',
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/EnquiryBase' } },
                    },
                },
                responses: { 200: { description: 'Updated enquiry' } },
            },
            delete: {
                tags: ['Enquiries'],
                summary: 'Delete enquiry by ID',
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'Deleted' },
                    404: { description: 'Not found' },
                },
            },
        },
        '/api/enquiries/{id}/upload/{type}': {
            post: {
                tags: ['Enquiries'],
                summary: 'Upload assets (coral / cad / reference) for an enquiry',
                parameters: [
                    { in: 'path', name: 'id',   required: true, schema: { type: 'string' } },
                    { in: 'path', name: 'type',  required: true, schema: { type: 'string', enum: ['coral', 'cad', 'reference'] } },
                    { in: 'query', name: 'version', schema: { type: 'string' } },
                ],
                requestBody: {
                    content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } },
                },
                responses: { 200: { description: 'Upload result' } },
            },
            put: {
                tags: ['Enquiries'],
                summary: 'Update asset metadata (approve, reject, etc.)',
                parameters: [
                    { in: 'path', name: 'id',   required: true, schema: { type: 'string' } },
                    { in: 'path', name: 'type',  required: true, schema: { type: 'string', enum: ['coral', 'cad', 'reference'] } },
                    { in: 'query', name: 'version', schema: { type: 'string' } },
                ],
                requestBody: {
                    content: { 'application/json': { schema: { type: 'object' } } },
                },
                responses: { 200: { description: 'Update result' } },
            },
        },

        // ════════════════════════════════════════════════════════════════════
        // Chats
        // ════════════════════════════════════════════════════════════════════
        '/api/chats': {
            get: {
                tags: ['Chats'],
                summary: 'Get all chats for the authenticated user',
                responses: {
                    200: {
                        content: {
                            'application/json': {
                                schema: { type: 'array', items: { $ref: '#/components/schemas/Chat' } },
                            },
                        },
                    },
                },
            },
        },

        // ════════════════════════════════════════════════════════════════════
        // Messages
        // ════════════════════════════════════════════════════════════════════
        '/api/message/{chatId}/messages': {
            get: {
                tags: ['Messages'],
                summary: 'Get all messages in a chat',
                parameters: [{ in: 'path', name: 'chatId', required: true, schema: { type: 'string' } }],
                responses: {
                    200: {
                        content: {
                            'application/json': {
                                schema: { type: 'array', items: { $ref: '#/components/schemas/Message' } },
                            },
                        },
                    },
                },
            },
        },
        '/api/message/upload': {
            post: {
                tags: ['Messages'],
                summary: 'Upload a media file within a chat',
                requestBody: {
                    content: {
                        'multipart/form-data': {
                            schema: {
                                type: 'object',
                                properties: {
                                    file:   { type: 'string', format: 'binary' },
                                    chatId: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: { 200: { description: 'Uploaded file URL' } },
            },
        },

        // ════════════════════════════════════════════════════════════════════
        // Codelists
        // ════════════════════════════════════════════════════════════════════
        '/api/codelists/{name}': {
            get: {
                tags: ['Codelists'],
                summary: 'Get a codelist by type name',
                security: [],
                parameters: [
                    {
                        in: 'path', name: 'name', required: true,
                        schema: { type: 'string' },
                        description: 'Codelist type, e.g. Roles, Status, StoneTypes',
                    },
                ],
                responses: {
                    200: {
                        content: {
                            'application/json': {
                                schema: { type: 'array', items: { $ref: '#/components/schemas/CodeValue' } },
                            },
                        },
                    },
                    404: { description: 'Codelist not found' },
                },
            },
        },

        // ════════════════════════════════════════════════════════════════════
        // Notifications
        // ════════════════════════════════════════════════════════════════════
        '/api/notifications': {
            get: {
                tags: ['Notifications'],
                summary: 'Get all notifications for the authenticated user',
                responses: {
                    200: {
                        content: {
                            'application/json': {
                                schema: { type: 'array', items: { $ref: '#/components/schemas/Notification' } },
                            },
                        },
                    },
                },
            },
        },
        '/api/notifications/unread-count': {
            get: {
                tags: ['Notifications'],
                summary: 'Get the unread notification count',
                responses: {
                    200: {
                        content: {
                            'application/json': {
                                schema: { type: 'object', properties: { count: { type: 'number' } } },
                            },
                        },
                    },
                },
            },
        },
        '/api/notifications/mark-all-read': {
            post: {
                tags: ['Notifications'],
                summary: 'Mark all notifications as read',
                responses: { 200: { description: 'All marked read' } },
            },
        },
        '/api/notifications/{id}/read': {
            patch: {
                tags: ['Notifications'],
                summary: 'Mark a single notification as read',
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'Marked read' },
                    404: { description: 'Not found' },
                },
            },
        },
    },
};

module.exports = swaggerSpec;
