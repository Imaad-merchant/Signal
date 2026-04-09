import { useLocation } from 'react-router-dom';

export default function PageNotFound() {
    const location = useLocation();
    const pageName = location.pathname.substring(1);

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#1e1f20]">
            <div className="max-w-md w-full">
                <div className="text-center space-y-6">
                    <div className="space-y-2">
                        <h1 className="text-7xl font-light text-gray-600">404</h1>
                        <div className="h-0.5 w-16 bg-gray-700 mx-auto"></div>
                    </div>
                    <div className="space-y-3">
                        <h2 className="text-2xl font-medium text-gray-200">
                            Page Not Found
                        </h2>
                        <p className="text-gray-400 leading-relaxed">
                            The page <span className="font-medium text-gray-300">"{pageName}"</span> could not be found.
                        </p>
                    </div>
                    <div className="pt-6">
                        <button
                            onClick={() => window.location.href = '/'}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-200 bg-[#2d2e30] border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                        >
                            Go Home
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
