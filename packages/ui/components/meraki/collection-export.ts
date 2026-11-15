/** Spreadsheet export for the collections screens. Runs in the browser; nothing leaves the device. */

const cell = (value: string | number | undefined) => {
    const text = value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (header: string[], rows: (string | number | undefined)[][]) => [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");

/** Save rows as a .csv file. Returns false where there is no document (server render). */
export const downloadCsv = (filename: string, header: string[], rows: (string | number | undefined)[][]) => {
    if (typeof document === "undefined") return false;
    const url = URL.createObjectURL(new Blob([toCsv(header, rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
};
