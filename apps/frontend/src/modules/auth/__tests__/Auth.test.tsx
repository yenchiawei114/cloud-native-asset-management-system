import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthPage } from '../../../pages/AuthPage';

describe('AuthModule TDD Flow', () => {
  it('should render login page with welcome title and credentials fields', () => {
    render(
      <BrowserRouter>
        <AuthPage />
      </BrowserRouter>
    );

    // 我們期望看到「歡迎回來」這個翻譯 Key (在測試環境 mock 中會直接顯示 key 名稱)
    expect(screen.getByText('auth.title')).toBeInTheDocument();
    
    // 檢查是否有帳號與密碼的標籤
    expect(screen.getByText('auth.idEmail')).toBeInTheDocument();
    expect(screen.getByText('auth.password')).toBeInTheDocument();
    
    // 檢查是否有登入按鈕
    expect(screen.getByRole('button', { name: /auth.enterControlCenter/i })).toBeInTheDocument();
  });

  it('should switch to register form when register tab is clicked', () => {
    render(
      <BrowserRouter>
        <AuthPage />
      </BrowserRouter>
    );

    // 點選切換到註冊
    const registerTab = screen.getByText('auth.registerTab');
    fireEvent.click(registerTab);

    // 應該看到註冊頁面的標題
    expect(screen.getByText('auth.registerTitle')).toBeInTheDocument();
    // 應該看到姓名欄位
    expect(screen.getByText('auth.fullName')).toBeInTheDocument();
  });
});
