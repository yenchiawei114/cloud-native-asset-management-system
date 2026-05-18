import { useState, useEffect } from 'react';
import { api, User, UserCreatePayload } from '../../../lib/api';

export const useUsers = (keyword?: string) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.listUsers(keyword);
      setUsers(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const deleteUser = async (employeeId: string) => {
    try {
      await api.deleteUser(employeeId);
      await fetchUsers();
      return true;
    } catch (err: any) {
      throw new Error(err.message || 'Delete failed');
    }
  };

  const createUser = async (payload: UserCreatePayload) => {
    try {
      const newUser = await api.createUser(payload);
      await fetchUsers();
      return newUser;
    } catch (err: any) {
      throw new Error(err.message || 'Create failed');
    }
  };

  const updateUser = async (employeeId: string, payload: Partial<UserCreatePayload>) => {
    try {
      const updated = await api.updateUser(employeeId, payload);
      await fetchUsers();
      return updated;
    } catch (err: any) {
      throw new Error(err.message || 'Update failed');
    }
  };

  return { users, loading, error, refresh: fetchUsers, deleteUser, createUser, updateUser };
};
