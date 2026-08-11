"use server";

import { revalidatePath } from "next/cache";
import { CustomerService } from "@/server/customers/customer-service";

function optionalString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function createCustomerAction(formData: FormData) {
  await CustomerService.create({
    name: String(formData.get("name") ?? ""),
    phone: optionalString(formData.get("phone")),
    email: optionalString(formData.get("email")),
    birthDate: optionalString(formData.get("birthDate")),
  });
  revalidatePath("/clientes");
}
