import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';

// GET /api/analytics/dashboard - Get dashboard analytics
export const getDashboardAnalytics = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Get basic counts
        const totalStudents = await Student.countDocuments({ isActive: true });
        const todayAttendance = await Attendance.countDocuments({
            date: { $gte: today, $lt: tomorrow }
        });

        // Get attendance summary for today
        const attendanceSummary = await Attendance.aggregate([
            { $match: { date: { $gte: today, $lt: tomorrow } } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Convert to object for easier access
        const summary = {
            present: 0,
            late: 0,
            absent: 0,
            pending_verification: 0
        };

        attendanceSummary.forEach(item => {
            summary[item._id] = item.count;
        });

        res.json({
            totalStudents,
            todayAttendance,
            attendanceRate: totalStudents > 0 ? ((summary.present + summary.late) / totalStudents * 100).toFixed(1) : 0,
            summary
        });
    } catch (error) {
        console.error('Error fetching dashboard analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
}; 