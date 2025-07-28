import express from 'express';
import { validateStudent, validateStudentUpdate } from '../middleware/validation.js';
import {
    getAllStudents,
    getStudentById,
    createStudent,
    updateStudent,
    deleteStudent,
    bulkImportStudents,
    exportStudentsToCSV,
    getStudentStats
} from '../controllers/studentsController.js';

const router = express.Router();

// GET /api/students - Get all students with pagination and filtering
router.get('/', getAllStudents);

// GET /api/students/:id - Get single student
router.get('/:id', getStudentById);

// POST /api/students - Create new student
router.post('/', createStudent);

// PUT /api/students/:id - Update student
router.put('/:id', updateStudent);

// DELETE /api/students/:id - Delete student
router.delete('/:id', deleteStudent);

// POST /api/students/bulk-import - Import students from CSV or Excel
router.post('/bulk-import', bulkImportStudents);

// GET /api/students/export/csv - Export students to CSV
router.get('/export/csv', exportStudentsToCSV);

// GET /api/students/stats - Get student statistics
router.get('/stats/overview', getStudentStats);

export default router; 