// // report.service.js — Node + ESM safe

// import pdfMake from "pdfmake/build/pdfmake.js";
// import vfsFonts from "pdfmake/build/vfs_fonts.js";
// import * as clientService from "./client.service.js";

// // Attach fonts safely across pdfmake versions
// pdfMake.vfs =
//   (vfsFonts?.pdfMake?.vfs) ??
//   (vfsFonts?.vfs) ??
//   (() => { throw new Error("pdfMake vfs not found"); })();

// export async function buildEnquiryPdf(rows = []) {

//   // ---- Resolve client names ----
//   const clients = await clientService.getClients();
//   const clientsMap = clients.reduce((acc, c) => {
//     acc[c._id] = c.Name;
//     return acc;
//   }, {});

//   // ---- Build table body ----
//   const body = [
//     [
//       "Name",
//       "Status",
//       "Client",
//       "Metal KT",
//       "Metal Color",
//       "Stone Type",
//       "Priority",
//       "Shipping Date"
//     ],

//     ...rows.map(r => [
//       r.Name ?? "",
//       r.CurrentStatus ?? "",
//       clientsMap[r.ClientId] ?? "",
//       r.Metal?.Quality ?? "",
//       r.Metal?.Color ?? "",
//       r.StoneType ?? "",
//       r.Priority ?? "",
//       r.ShippingDate
//         ? new Date(r.ShippingDate).toLocaleDateString()
//         : ""
//     ])
//   ];

//   const doc = {
//     content: [
//       { text: "Enquiry Report", style: "header" },
//       {
//         table: {
//           headerRows: 1,
//           widths: ["*", "auto", "*", "auto", "auto", "*", "auto", "auto"],
//           body
//         }
//       }
//     ],
//     styles: {
//       header: { fontSize: 16, bold: true, margin: [0, 0, 0, 10] }
//     }
//   };

//   // ---- Generate PDF Buffer ----
//   return new Promise(resolve => {
//     pdfMake.createPdf(doc).getBuffer(buffer => resolve(buffer));
//   });
// }
