import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import Student from '../models/Student.js';

// GET /api/students - Get all students with pagination and filtering
export const getAllStudents = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search,
            course,
            batch,
            isActive,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build filter object
        const filter = {};

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { studentId: { $regex: search, $options: 'i' } }
            ];
        }

        if (course) filter.course = { $regex: course, $options: 'i' };
        if (batch) filter.batch = { $regex: batch, $options: 'i' };
        if (isActive !== undefined) filter.isActive = isActive === 'true';

        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        // Execute query with pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const students = await Student.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Get total count for pagination
        const total = await Student.countDocuments(filter);

        // Get summary statistics
        const stats = await Student.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    active: { $sum: { $cond: ['$isActive', 1, 0] } }
                }
            }
        ]);

        res.json({
            students,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                total,
                limit: parseInt(limit)
            },
            stats: stats[0] || { total: 0, active: 0 }
        });
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ error: 'Failed to fetch students' });
    }
};

// GET /api/students/:id - Get single student
export const getStudentById = async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }
        res.json(student);
    } catch (error) {
        console.error('Error fetching student:', error);
        res.status(500).json({ error: 'Failed to fetch student' });
    }
};

// POST /api/students - Create new student
export const createStudent = async (req, res) => {
    try {
        const studentData = req.body;

        const student = new Student(studentData);
        await student.save();

        res.status(201).json({
            message: 'Student created successfully',
            student
        });
    } catch (error) {
        console.error('Error creating student:', error);
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                error: `Student with this ${field} already exists`
            });
        }
        res.status(500).json({ error: 'Failed to create student' });
    }
};

// PUT /api/students/:id - Update student
export const updateStudent = async (req, res) => {
    try {
        const studentData = req.body;

        const student = await Student.findByIdAndUpdate(
            req.params.id,
            studentData,
            { new: true, runValidators: true }
        );

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        res.json({
            message: 'Student updated successfully',
            student
        });
    } catch (error) {
        console.error('Error updating student:', error);
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                error: `Student with this ${field} already exists`
            });
        }
        res.status(500).json({ error: 'Failed to update student' });
    }
};

// DELETE /api/students/:id - Delete student
export const deleteStudent = async (req, res) => {
    try {
        const student = await Student.findByIdAndDelete(req.params.id);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }



        res.json({ message: 'Student deleted successfully' });
    } catch (error) {
        console.error('Error deleting student:', error);
        res.status(500).json({ error: 'Failed to delete student' });
    }
};

// POST /api/students/bulk-import - Import students from CSV or Excel
export const bulkImportStudents = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File is required' });
        }

        const results = [];
        const errors = [];
        const fileExtension = path.extname(req.file.originalname).toLowerCase();
        let data = [];

        try {
            if (fileExtension === '.csv') {
                // Parse CSV file
                data = await parseCSVFile(req.file.path);
            } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
                // Parse Excel file
                data = await parseExcelFile(req.file.path);
            } else {
                return res.status(400).json({ error: 'Unsupported file format' });
            }

            // Process each row
            for (let i = 0; i < data.length; i++) {
                const rowNumber = i + 2; // +2 because we skip header and array is 0-indexed
                try {
                    const row = data[i];

                    // Map columns to student schema
                    const studentData = {
                        name: row.name || row.student_name,
                        email: row.email,
                        phone: row.phone || row.mobile || row.phone_number,
                        studentId: row.student_id || row.id || row.roll_number || row.studentid,
                        course: row.course,
                        batch: row.batch,
                        metadata: {
                            importedFrom: fileExtension === '.csv' ? 'csv' : 'excel',
                            importedAt: new Date(),
                            importedBy: 'admin'
                        }
                    };

                    // Validate required fields
                    if (!studentData.name || !studentData.email || !studentData.phone || !studentData.studentId) {
                        errors.push({
                            row: rowNumber,
                            error: 'Missing required fields (name, email, phone, studentId)'
                        });
                        continue;
                    }

                    const student = new Student(studentData);
                    await student.save();
                    results.push(student);
                } catch (error) {
                    errors.push({
                        row: rowNumber,
                        error: error.message
                    });
                }
            }

            // Clean up uploaded file
            fs.unlinkSync(req.file.path);

            res.json({
                message: `Import completed. ${results.length} students imported successfully.`,
                imported: results.length,
                errors: errors.length,
                errorDetails: errors,
                fileType: fileExtension === '.csv' ? 'CSV' : 'Excel'
            });
        } catch (parseError) {
            // Clean up uploaded file on error
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            throw parseError;
        }
    } catch (error) {
        console.error('Error importing students:', error);
        res.status(500).json({ error: 'Failed to import students' });
    }
};

// Helper function to parse CSV file
async function parseCSVFile(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv({
                mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, '_')
            }))
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

// Helper function to parse Excel file
async function parseExcelFile(filePath) {
    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0]; // Use first sheet
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON with header normalization
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            raw: false,
            defval: ''
        });

        // Normalize headers (convert to lowercase and replace spaces with underscores)
        const normalizedData = jsonData.map(row => {
            const normalizedRow = {};
            Object.keys(row).forEach(key => {
                const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, '_');
                normalizedRow[normalizedKey] = row[key];
            });
            return normalizedRow;
        });

        return normalizedData;
    } catch (error) {
        throw new Error(`Failed to parse Excel file: ${error.message}`);
    }
}

// GET /api/students/export/csv - Export students to CSV
export const exportStudentsToCSV = async (req, res) => {
    try {
        const students = await Student.find({}).lean();

        // Convert to CSV format
        const csvHeader = 'Name,Email,Phone,Student ID,Course,Batch,Active,Created At\n';
        const csvRows = students.map(student => {
            return [
                student.name,
                student.email,
                student.phone,
                student.studentId,
                student.course,
                student.batch,
                student.isActive,
                student.createdAt.toISOString()
            ].map(field => `"${field}"`).join(',');
        }).join('\n');

        const csvContent = csvHeader + csvRows;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=students.csv');
        res.send(csvContent);
    } catch (error) {
        console.error('Error exporting students:', error);
        res.status(500).json({ error: 'Failed to export students' });
    }
};

// GET /api/students/stats - Get student statistics
export const getStudentStats = async (req, res) => {
    try {
        const stats = await Student.aggregate([
            {
                $group: {
                    _id: null,
                    totalStudents: { $sum: 1 },
                    activeStudents: { $sum: { $cond: ['$isActive', 1, 0] } }
                }
            }
        ]);

        const courseStats = await Student.aggregate([
            { $group: { _id: '$course', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const batchStats = await Student.aggregate([
            { $group: { _id: '$batch', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        res.json({
            overview: stats[0] || { totalStudents: 0, activeStudents: 0 },
            courseDistribution: courseStats,
            batchDistribution: batchStats
        });
    } catch (error) {
        console.error('Error fetching student stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
}; 