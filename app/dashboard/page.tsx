"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Patient } from "@/types/patient";
import { formatDate } from "@/utils/dateUtils";
import LoadingSpinner from "@/components/LoadingSpinner";
import { debounce } from "@/utils/debounce";

const PAGE_SIZE = 12;
const MAX_PATIENT_NAME_LENGTH = 120;
const SEARCH_DEBOUNCE_MS = 250;

function sanitizeTextInput(value: string): string {
  return value.replace(/\s+/g, " ").trimStart();
}

export default function DashboardPage() {
  const { currentUser, loading, signOut } = useAuth();
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTermInput, setSearchTermInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientDOB, setNewPatientDOB] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const debouncedSetSearchTerm = useMemo(
    () => debounce((value: string) => setSearchTerm(value), SEARCH_DEBOUNCE_MS),
    []
  );

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push("/login");
    }
  }, [currentUser, loading, router]);

  useEffect(() => {
    if (currentUser) {
      fetchPatients();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const fetchPatients = async () => {
    if (!currentUser) return;
    try {
      const q = query(
        collection(db, "patients"),
        where("doctorId", "==", currentUser.uid),
        where("isDeleted", "==", false)
      );
      const querySnapshot = await getDocs(q);
      const patientsData: Patient[] = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Patient[];
      setPatients(patientsData);
    } catch (error) {
      console.error("Error fetching patients:", error);
    }
  };

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = sanitizeTextInput(newPatientName).trim();
    if (!currentUser || !cleanName || cleanName.length > MAX_PATIENT_NAME_LENGTH) return;
    if (!newPatientDOB || Number.isNaN(Date.parse(newPatientDOB))) return;

    setSaving(true);
    try {
      await addDoc(collection(db, "patients"), {
        doctorId: currentUser.uid,
        patientName: cleanName,
        dateOfBirth: new Date(newPatientDOB).toISOString(),
        consultations: [],
        createdAt: serverTimestamp(),
        isDeleted: false,
      });

      setNewPatientName("");
      setNewPatientDOB("");
      setShowAddModal(false);
      fetchPatients();
    } catch (error) {
      console.error("Error adding patient:", error);
      alert("Failed to add patient. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePatient = async (patientId: string) => {
    if (!confirm("Are you sure you want to delete this patient?")) return;
    try {
      const docRef = doc(db, "patients", patientId);
      await updateDoc(docRef, {
        isDeleted: true,
        deletedAt: serverTimestamp(),
      });
      fetchPatients();
    } catch (error) {
      console.error("Error deleting patient:", error);
    }
  };

  const filteredPatients = useMemo(() => 
    patients.filter((patient) =>
      patient.patientName.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [patients, searchTerm]
  );

  const totalPages = Math.ceil(filteredPatients.length / PAGE_SIZE);
  const paginatedPatients = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredPatients.slice(start, start + PAGE_SIZE);
  }, [filteredPatients, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleSearchChange = (value: string) => {
    const cleanValue = sanitizeTextInput(value).slice(0, MAX_PATIENT_NAME_LENGTH);
    setSearchTermInput(cleanValue);
    debouncedSetSearchTerm(cleanValue.trim());
  };

  const handlePatientNameChange = (value: string) => {
    setNewPatientName(sanitizeTextInput(value).slice(0, MAX_PATIENT_NAME_LENGTH));
  };

  if (loading || !currentUser) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">MediVault</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{currentUser.email}</span>
            <button
              onClick={() => signOut()}
              className="text-sm text-red-600 hover:text-red-700"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Patients</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add Patient
          </button>
        </div>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Search patients..."
            value={searchTermInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            maxLength={MAX_PATIENT_NAME_LENGTH}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {paginatedPatients.map((patient) => (
            <div
              key={patient.id}
              className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {patient.patientName}
                </h3>
                <button
                  onClick={() => handleDeletePatient(patient.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                DOB: {patient.dateOfBirth ? formatDate(patient.dateOfBirth) : "Not specified"}
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Consultations: {patient.consultations?.length || 0}
              </p>
              <button
                onClick={() => router.push(`/patient/${patient.id}`)}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                View Patient
              </button>
            </div>
          ))}
        </div>

        {filteredPatients.length === 0 && (
          <p className="text-center text-gray-500 mt-8">
            {searchTerm ? "No patients found" : "No patients yet. Add one to get started."}
          </p>
        )}
        {filteredPatients.length > 0 && totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-gray-700 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-gray-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </main>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full text-gray-900">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Add New Patient</h3>
            <form onSubmit={handleAddPatient}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Patient Name *
                </label>
                <input
                  type="text"
                  required
                  value={newPatientName}
                  onChange={(e) => handlePatientNameChange(e.target.value)}
                  maxLength={MAX_PATIENT_NAME_LENGTH}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Date of Birth *
                </label>
                <input
                  type="date"
                  required
                  value={newPatientDOB}
                  onChange={(e) => setNewPatientDOB(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Add Patient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
