const { z } = require("zod");

// passthrough() zaroori hai, warna zod baaki fields hata dega
// aur controller me data.city, data.bank_name... undefined ho jayenge.
const vendorSchema = z
  .object({
    name: z.string().trim().min(1, "Vendor Name is required!"),
    mobile_no: z.string().trim().min(1, "Mobile Number is required!"),
    ac_no: z.coerce.string().trim().min(1, "Account Number is required!")
  })
  .passthrough();

module.exports = { vendorSchema };