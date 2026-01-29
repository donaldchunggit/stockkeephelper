import { z } from "zod";

export const ProductUpsertSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  onHand: z.number().int().nonnegative(),
  reorderPoint: z.number().int().nonnegative(),
  reorderQty: z.number().int().nonnegative()
});

export const OrderCreateSchema = z.object({
  shopifyOrderNumber: z.string().min(1),
  customerName: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      sku: z.string().min(1),
      qty: z.number().int().positive()
    })
  ).default([])
});

export const OrderUpdateSchema = z.object({
  status: z.enum(["ORDERED", "PACKED", "SHIPPED", "DELIVERED", "RETURNED", "FAULTY"]).optional(),
  notes: z.string().optional(),
  trackingInput: z.string().optional() // URL or tracking #
});
