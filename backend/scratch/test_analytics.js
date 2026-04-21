import pool from '../src/config/db.js';
import { getDashboardAnalytics } from '../src/controllers/analyticsController.js';

const mockReq = {
    user: { id: 'admin-id' }
};
const mockRes = {
    json: (data) => console.log("Response Data:", JSON.stringify(data, null, 2)),
    status: (code) => {
        console.log("Status Code:", code);
        return mockRes;
    }
};
const mockNext = (err) => console.error("Next Error:", err);

async function test() {
    try {
        await getDashboardAnalytics(mockReq, mockRes, mockNext);
    } catch (e) {
        console.error("Caught Error:", e);
    } finally {
        process.exit(0);
    }
}
test();
