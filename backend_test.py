#!/usr/bin/env python3
"""
WaterTruth AI Backend API Testing Suite
Tests all endpoints and functionality for the water safety analysis system
"""

import requests
import sys
import json
import base64
from datetime import datetime
from pathlib import Path
from PIL import Image
import io

class WaterTruthAPITester:
    def __init__(self, base_url="https://watertruth.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED: {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def create_test_image(self):
        """Create a simple test image for upload"""
        # Create a simple blue-ish image (simulating water)
        img = Image.new('RGB', (300, 300), color=(100, 150, 200))
        
        # Convert to bytes
        img_buffer = io.BytesIO()
        img.save(img_buffer, format='PNG')
        img_buffer.seek(0)
        
        return img_buffer

    def test_health_check(self):
        """Test health check endpoint"""
        try:
            response = requests.get(f"{self.api_url}/health", timeout=10)
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            if success:
                data = response.json()
                details += f", Response: {data}"
            self.log_test("Health Check", success, details)
            return success
        except Exception as e:
            self.log_test("Health Check", False, str(e))
            return False

    def test_image_analysis(self):
        """Test image analysis endpoint"""
        try:
            # Create test image
            test_image = self.create_test_image()
            
            # Prepare multipart form data
            files = {'file': ('test_water.png', test_image, 'image/png')}
            
            response = requests.post(f"{self.api_url}/analyze", files=files, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                
                # Validate response structure
                required_fields = ['id', 'risk_level', 'confidence', 'visual_features', 'ai_explanation', 'recommendation']
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("Image Analysis", False, f"Missing fields: {missing_fields}")
                    return None
                
                # Validate risk level
                if data['risk_level'] not in ['LOW', 'MEDIUM', 'HIGH']:
                    self.log_test("Image Analysis", False, f"Invalid risk level: {data['risk_level']}")
                    return None
                
                # Validate confidence score
                if not (0 <= data['confidence'] <= 100):
                    self.log_test("Image Analysis", False, f"Invalid confidence: {data['confidence']}")
                    return None
                
                # Validate visual features
                features = data['visual_features']
                feature_fields = ['optical_reflection', 'refraction_distortion', 'surface_texture', 'turbidity', 'color_deviation', 'overall_quality']
                for field in feature_fields:
                    if field not in features or not (0 <= features[field] <= 100):
                        self.log_test("Image Analysis", False, f"Invalid feature {field}: {features.get(field)}")
                        return None
                
                self.log_test("Image Analysis", True, f"Risk: {data['risk_level']}, Confidence: {data['confidence']}%")
                return data['id']
            else:
                self.log_test("Image Analysis", False, f"Status: {response.status_code}, Response: {response.text}")
                return None
                
        except Exception as e:
            self.log_test("Image Analysis", False, str(e))
            return None

    def test_get_analysis(self, analysis_id):
        """Test getting specific analysis"""
        if not analysis_id:
            self.log_test("Get Specific Analysis", False, "No analysis ID provided")
            return False
            
        try:
            response = requests.get(f"{self.api_url}/analyses/{analysis_id}", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                # Validate that it contains image data
                if 'image_data' not in data:
                    self.log_test("Get Specific Analysis", False, "Missing image_data field")
                    return False
                
                # Validate other required fields
                required_fields = ['id', 'risk_level', 'confidence', 'visual_features', 'ai_explanation', 'recommendation']
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test("Get Specific Analysis", False, f"Missing fields: {missing_fields}")
                    return False
                
                self.log_test("Get Specific Analysis", True, f"Retrieved analysis {analysis_id}")
                return True
            else:
                self.log_test("Get Specific Analysis", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Get Specific Analysis", False, str(e))
            return False

    def test_get_analyses_list(self):
        """Test getting analyses list"""
        try:
            response = requests.get(f"{self.api_url}/analyses", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                if not isinstance(data, list):
                    self.log_test("Get Analyses List", False, "Response is not a list")
                    return False
                
                # If there are analyses, validate structure
                if len(data) > 0:
                    analysis = data[0]
                    required_fields = ['id', 'risk_level', 'confidence', 'visual_features', 'ai_explanation', 'recommendation']
                    missing_fields = [field for field in required_fields if field not in analysis]
                    
                    if missing_fields:
                        self.log_test("Get Analyses List", False, f"Missing fields in first analysis: {missing_fields}")
                        return False
                    
                    # Should NOT contain image_data for performance
                    if 'image_data' in analysis:
                        self.log_test("Get Analyses List", False, "Contains image_data (should be excluded for performance)")
                        return False
                
                self.log_test("Get Analyses List", True, f"Retrieved {len(data)} analyses")
                return True
            else:
                self.log_test("Get Analyses List", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Get Analyses List", False, str(e))
            return False

    def test_invalid_image_upload(self):
        """Test error handling for invalid image uploads"""
        try:
            # Test with non-image file
            files = {'file': ('test.txt', io.StringIO('This is not an image'), 'text/plain')}
            
            response = requests.post(f"{self.api_url}/analyze", files=files, timeout=10)
            
            # Should return error status
            if response.status_code >= 400:
                self.log_test("Invalid Image Upload Error Handling", True, f"Correctly rejected with status {response.status_code}")
                return True
            else:
                self.log_test("Invalid Image Upload Error Handling", False, f"Should have rejected invalid file, got status {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Invalid Image Upload Error Handling", False, str(e))
            return False

    def test_nonexistent_analysis(self):
        """Test getting non-existent analysis"""
        try:
            fake_id = "nonexistent-analysis-id"
            response = requests.get(f"{self.api_url}/analyses/{fake_id}", timeout=10)
            
            # Should return 404
            if response.status_code == 404:
                self.log_test("Non-existent Analysis Error Handling", True, "Correctly returned 404")
                return True
            else:
                self.log_test("Non-existent Analysis Error Handling", False, f"Expected 404, got {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Non-existent Analysis Error Handling", False, str(e))
            return False

    def run_all_tests(self):
        """Run all backend tests"""
        print("🧪 Starting WaterTruth AI Backend Tests")
        print(f"🌐 Testing API at: {self.api_url}")
        print("=" * 60)
        
        # Test 1: Health check
        if not self.test_health_check():
            print("❌ Health check failed - stopping tests")
            return self.generate_report()
        
        # Test 2: Image analysis (core functionality)
        analysis_id = self.test_image_analysis()
        
        # Test 3: Get specific analysis (if we have an ID)
        if analysis_id:
            self.test_get_analysis(analysis_id)
        
        # Test 4: Get analyses list
        self.test_get_analyses_list()
        
        # Test 5: Error handling tests
        self.test_invalid_image_upload()
        self.test_nonexistent_analysis()
        
        return self.generate_report()

    def generate_report(self):
        """Generate test report"""
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} test(s) failed")
            return 1

def main():
    """Main test execution"""
    tester = WaterTruthAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())