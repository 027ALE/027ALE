import { getStore } from "@netlify/blobs";

const STORE_NAME = "calendar-catalog";
const CATALOG_KEY = "catalog";

const DEFAULT_CATALOG = {
    version: 1,
    updatedAt: null,
    calendars: []
};

function jsonResponse(statusCode, data) {

    return {
        statusCode,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "X-Content-Type-Options": "nosniff"
        },
        body: JSON.stringify(data)
    };
}

function isValidCatalog(catalog) {

    if (!catalog || typeof catalog !== "object") {
        return false;
    }

    if (!Array.isArray(catalog.calendars)) {
        return false;
    }

    return true;
}

async function getCatalog(store) {

    let catalog = await store.get(
        CATALOG_KEY,
        {
            type: "json"
        }
    );

    if (!catalog) {

        catalog = structuredClone(
            DEFAULT_CATALOG
        );

        await store.setJSON(
            CATALOG_KEY,
            catalog
        );
    }

    return catalog;
}

export async function handler(event) {

    try {

        const store =
            getStore(STORE_NAME);

        //
        // GET
        //
        if (event.httpMethod === "GET") {

            const catalog =
                await getCatalog(store);

            const publicCatalog = {

                version:
                    catalog.version,

                updatedAt:
                    catalog.updatedAt,

                calendars:
                    catalog.calendars.map(
                        c => ({

                            id: c.id,

                            name: c.name,

                            encrypted:
                                !!c.encrypted

                        })
                    )
            };

            return jsonResponse(
                200,
                publicCatalog
            );
        }

        //
        // POST
        //
        if (event.httpMethod === "POST") {

            const adminKey =
                event.headers[
                    "x-admin-key"
                ];

            if (
                !adminKey ||
                adminKey !==
                process.env.ADMIN_KEY
            ) {

                return jsonResponse(
                    403,
                    {
                        error:
                        "Forbidden"
                    }
                );
            }

            let catalog;

            try {

                catalog =
                    JSON.parse(
                        event.body || "{}"
                    );

            } catch {

                return jsonResponse(
                    400,
                    {
                        error:
                        "Invalid JSON"
                    }
                );
            }

            if (
                !isValidCatalog(catalog)
            ) {

                return jsonResponse(
                    400,
                    {
                        error:
                        "Invalid catalog"
                    }
                );
            }

            catalog.version = 1;

            catalog.updatedAt =
                new Date()
                .toISOString();

            await store.setJSON(
                CATALOG_KEY,
                catalog
            );

            return jsonResponse(
                200,
                {
                    success: true
                }
            );
        }

        return jsonResponse(
            405,
            {
                error:
                "Method Not Allowed"
            }
        );

    } catch {

        return jsonResponse(
            500,
            {
                error:
                "Internal Server Error"
            }
        );
    }
}