import { useState, useEffect, useCallback } from 'react';
import { api, User, UserCreatePayload } from '../../../lib/api';

const PAGE_LIMIT = 50;

interface UseUsersParams {
  keyword?: string;
  sex?: string;
  department_id?: number;
  location?: string;
  role?: string;
  must_change_password?: boolean;
}

export const useUsers = (params?: UseUsersParams) => {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const paramsKey = JSON.stringify(params);

  const fetchUsers = useCallback(async (currentSkip = skip) => {
    setLoading(true);
    try {
      const data = await api.listUsers({
        keyword: params?.keyword,
        sex: params?.sex,
        department_id: params?.department_id,
        location: params?.location,
        role: params?.role,
        must_change_password: params?.must_change_password,
        skip: currentSkip,
        limit: PAGE_LIMIT,
      });
      setUsers(data.items);
      setTotal(data.total);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, skip]);

  // 當搜尋參數變動時重置到第一頁
  useEffect(() => {
    setSkip(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers(skip);
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, skip]);

  const onPageChange = (newSkip: number) => {
    setSkip(newSkip);
  };

  const deleteUser = async (employeeId: string) => {
    try {
      await api.deleteUser(employeeId);
      await fetchUsers(skip);
      return true;
    } catch (err: any) {
      throw new Error(err.message || 'Delete failed');
    }
  };

  const createUser = async (payload: UserCreatePayload) => {
    try {
      const newUser = await api.createUser(payload);
      await fetchUsers(skip);
      return newUser;
    } catch (err: any) {
      throw new Error(err.message || 'Create failed');
    }
  };

  const updateUser = async (employeeId: string, payload: Partial<UserCreatePayload>) => {
    try {
      const updated = await api.updateUser(employeeId, payload);
      await fetchUsers(skip);
      return updated;
    } catch (err: any) {
      throw new Error(err.message || 'Update failed');
    }
  };

  return {
    users,
    total,
    skip,
    limit: PAGE_LIMIT,
    loading,
    error,
    refresh: () => fetchUsers(skip),
    deleteUser,
    createUser,
    updateUser,
    onPageChange,
  };
};
