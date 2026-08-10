"use server";

import { revalidatePath } from "next/cache";
import { CustomerService } from "@/server/customers/customer-service";
import { CustomerAddressService } from "@/server/customers/address-service";

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

export async function createCustomerAddressAction(formData: FormData) {
  const customerId = String(formData.get("customerId") ?? "");
  await CustomerAddressService.create(customerId, {
    label: String(formData.get("label") || "Principal"),
    recipientName: optionalString(formData.get("recipientName")),
    phone: optionalString(formData.get("phone")),
    postalCode: String(formData.get("postalCode") ?? ""),
    street: String(formData.get("street") ?? ""),
    number: String(formData.get("number") ?? ""),
    complement: optionalString(formData.get("complement")),
    district: String(formData.get("district") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    reference: optionalString(formData.get("reference")),
    isDefault: formData.get("isDefault") === "on",
  });
  revalidatePath(`/clientes/${customerId}`);
}

export async function setDefaultCustomerAddressAction(formData: FormData) {
  const customerId = String(formData.get("customerId") ?? "");
  await CustomerAddressService.setDefault(String(formData.get("addressId") ?? ""));
  revalidatePath(`/clientes/${customerId}`);
}

export async function removeCustomerAddressAction(formData: FormData) {
  const customerId = String(formData.get("customerId") ?? "");
  await CustomerAddressService.remove(String(formData.get("addressId") ?? ""));
  revalidatePath(`/clientes/${customerId}`);
}
