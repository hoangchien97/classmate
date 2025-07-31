   import { useRoutes } from 'react-router-dom';
   import AuthLayout from '../layouts/AuthLayout';
   import MainLayout from '../layouts/MainLayout';
   import LoginPage from '../pages/LoginPage';
   import RegisterPage from '../pages/RegisterPage';
   import ProtectedRoute from '../components/ProtectedRoute';

   function Routes() {
     return useRoutes([
       {
         element: (
           <ProtectedRoute requireAuth={false}>
             <AuthLayout />
           </ProtectedRoute>
         ),
         children: [
           { path: 'login', element: <LoginPage /> },
           { path: 'register', element: <RegisterPage /> },
         ],
       },
       {
         element: (
           <ProtectedRoute requireAuth={true}>
             <MainLayout />
           </ProtectedRoute>
         ),
         children: [
           { path: 'checkin', element: <div>Check-in Page (WIP)</div> },
           { path: '/', element: <div>Welcome to ClassMate</div> },
         ],
       },
     ]);
   }

   export default Routes;