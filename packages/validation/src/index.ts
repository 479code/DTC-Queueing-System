import { z } from "zod";

export const siteIdSchema = z.string().min(1);
export const documentIdSchema = z.string().min(1);

export const reportTruckReturnInputSchema = z.object({
  siteId: siteIdSchema,
  truckId: documentIdSchema
});

export const saveTruckInputSchema = z.object({
  siteId: siteIdSchema,
  truckId: documentIdSchema.optional(),
  registrationNumber: z.string().trim().min(2).max(40),
  driverName: z.string().trim().min(2).max(120),
  assignedFleetOfficerId: documentIdSchema,
  isActive: z.boolean().default(true)
});

export const batchSaveTrucksInputSchema = z.object({
  siteId: siteIdSchema,
  trucks: z.array(z.object({
    registrationNumber: z.string().trim().min(2).max(40),
    driverName: z.string().trim().min(2).max(120),
    assignedFleetOfficerId: documentIdSchema
  })).min(1).max(100)
});

export const previewProgrammingBatchInputSchema = z.object({
  siteId: siteIdSchema,
  requestedSize: z.number().int().min(1),
  includeBypassAuthorizationIds: z.array(documentIdSchema).optional()
});

export const listValidatedBypassesInputSchema = z.object({
  siteId: siteIdSchema
});

export const confirmProgrammingBatchInputSchema = previewProgrammingBatchInputSchema.extend({
  previewToken: z.string().optional(),
  atcAssignments: z.array(z.object({
    queueCycleId: documentIdSchema,
    atcNo: z.string().trim().min(1).max(80).transform((value) => value.toUpperCase())
  })).min(1)
});

export const startAvailabilityBatchInputSchema = previewProgrammingBatchInputSchema;

export const confirmTruckAvailabilityInputSchema = z.object({
  siteId: siteIdSchema,
  batchId: documentIdSchema,
  queueCycleId: documentIdSchema
});

export const confirmTruckDispatchInputSchema = z.object({
  siteId: siteIdSchema,
  queueCycleId: documentIdSchema
});

export const getAvailabilityBatchInputSchema = z.object({
  siteId: siteIdSchema,
  batchId: documentIdSchema
});

export const confirmProgrammingWithOrdersInputSchema = z.object({
  siteId: siteIdSchema,
  batchId: documentIdSchema,
  orderAssignments: z.array(z.object({
    queueCycleId: documentIdSchema,
    orderId: documentIdSchema
  })).min(1)
});

export const requestBypassInputSchema = z.object({
  siteId: siteIdSchema,
  truckId: documentIdSchema,
  queueCycleId: documentIdSchema,
  reasonCategory: z.enum([
    "OPERATIONAL_REQUIREMENT",
    "DESTINATION_SPECIFIC_REQUIREMENT",
    "EMERGENCY_MOVEMENT",
    "CUSTOMER_REQUIREMENT",
    "MANAGEMENT_INSTRUCTION",
    "OTHER"
  ]),
  explanation: z.string().trim().min(10)
});

export const approveBypassInputSchema = z.object({
  siteId: siteIdSchema,
  bypassRequestId: documentIdSchema
});

export const rejectBypassInputSchema = approveBypassInputSchema.extend({
  rejectionReason: z.string().trim().min(5)
});

export const validateBypassOtpInputSchema = z.object({
  siteId: siteIdSchema,
  truckId: documentIdSchema,
  otp: z.string().regex(/^\d{6}$/)
});

export const registerDeviceTokenInputSchema = z.object({
  siteId: siteIdSchema,
  deviceId: z.string().trim().min(1).max(200),
  fcmToken: z.string().trim().min(20).max(4096),
  platform: z.enum(["android", "ios"]),
  appVersion: z.string().trim().min(1).max(50).optional()
});

export const unregisterDeviceTokenInputSchema = z.object({
  siteId: siteIdSchema,
  deviceId: z.string().trim().min(1).max(200)
});

export const updateInsuranceInputSchema = z.object({
  siteId: siteIdSchema,
  truckId: documentIdSchema,
  policyNumber: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  effectiveDate: z.string().trim().min(1),
  expiryDate: z.string().trim().min(1),
  documentPath: z.string().optional()
});

export const correctRecordInputSchema = z.object({
  siteId: siteIdSchema,
  targetPath: z.string().min(1),
  correctionType: z.string().min(1),
  previousValue: z.unknown(),
  correctedValue: z.unknown(),
  reason: z.string().trim().min(10)
});

export const uploadOrderWorkbookInputSchema = z.object({
  siteId: siteIdSchema,
  importId: documentIdSchema,
  storagePath: z.string().trim().min(1).max(1024),
  originalFileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(200),
  fileSize: z.number().int().positive().max(20 * 1024 * 1024),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase())
});



export const processOrderImportInputSchema = z.object({
  siteId: siteIdSchema,
  importId: documentIdSchema
});

export const listAvailableOrdersInputSchema = z.object({
  siteId: siteIdSchema
});

export const recalculateDailyMetricsInputSchema = z.object({
  siteId: siteIdSchema,
  date: z.string().regex(/^\d{8}$/).optional()
});

export const setUserAccessInputSchema = z.object({
  siteId: siteIdSchema,
  userId: documentIdSchema,
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).optional(),
  roles: z.array(z.enum([
    "fleetOfficer",
    "programmingOfficer",
    "overseer",
    "management",
    "auditor",
    "administrator"
  ])).min(1).max(6),
  isActive: z.boolean(),
  mfaRequired: z.boolean().default(false)
});

export const provisionUserInputSchema = z.object({
  siteId: siteIdSchema,
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  roles: z.array(z.enum([
    "fleetOfficer",
    "programmingOfficer",
    "overseer",
    "management",
    "auditor",
    "administrator"
  ])).min(1).max(6),
  mfaRequired: z.boolean().default(false)
});
