import type { Asset, AssetUpdatePayload, Vendor } from '../../../lib/api';

export function buildAssetUpdatePayload(
  asset: Asset,
  edits: Record<string, string | number | null | undefined>,
  vendors?: Vendor[],
): AssetUpdatePayload {
  const payload: AssetUpdatePayload = { version: asset.version };

  const scalarFields = [
    'name',
    'type',
    'model',
    'specification',
    'purchase_date',
    'purchase_price',
    'storage_location',
    'activation_date',
    'warranty_expiry',
  ] as const;

  for (const field of scalarFields) {
    if (field in edits) {
      Object.assign(payload, { [field]: edits[field] });
    }
  }

  if ('vendor_id' in edits && edits.vendor_id != null && edits.vendor_id !== '') {
    payload.vendor_id = Number(edits.vendor_id);
  } else if ('vendor' in edits && vendors) {
    const match = vendors.find((vendor) => vendor.name === edits.vendor);
    if (match) payload.vendor_id = match.id;
  }

  if (payload.purchase_price != null) {
    payload.purchase_price = Number(payload.purchase_price);
  }

  return payload;
}
